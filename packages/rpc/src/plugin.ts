import type { Plugin, ViteDevServer } from 'vite'
import { getWsApi } from '@v43/plugin-ws'

const RUNTIME_PATH = '/@v43/rpc-runtime'
const RUNTIME_FILE = new URL('./runtime.ts', import.meta.url).pathname
const SERVER_PREFIX = 'virtual:v43-server:'

export function rpcPlugin(): Plugin {
  const serverModules = new Map<string, string>()
  let server: ViteDevServer | null = null

  return {
    name: 'v43:rpc',

    async resolveId(source, importer) {
      if (source === RUNTIME_PATH) return RUNTIME_FILE
      if (source.startsWith(SERVER_PREFIX)) return '\0' + source

      if (importer?.startsWith('\0' + SERVER_PREFIX)) {
        const originalPath = importer.slice(('\0' + SERVER_PREFIX).length)
        return this.resolve(source, originalPath, { skipSelf: true })
      }

      return null
    },

    load(id) {
      if (id.startsWith('\0' + SERVER_PREFIX)) {
        return serverModules.get(id.slice(('\0' + SERVER_PREFIX).length))
      }
      return null
    },

    transformIndexHtml(_html: string, ctx: { server?: unknown }) {
      if (!ctx.server) return []
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: RUNTIME_PATH },
          injectTo: 'head-prepend' as const,
        },
      ]
    },

    // Runs after Vite's esbuild transform (no enforce:'pre'), so code is JS not TS
    transform(code, id) {
      if (!code.includes('use server')) return null
      if (id.includes('node_modules') || id === RUNTIME_FILE || id.startsWith(SERVER_PREFIX))
        return null

      // Rollup's parser adds start/end positions at runtime, but estree types don't declare them
      const ast = this.parse(code) as unknown as AstProgram
      const fns = findServerFunctions(ast, code)
      if (fns.length === 0) return null

      // Build and store the server-side virtual module
      serverModules.set(id, buildServerModule(code, ast, fns))

      // Invalidate SSR module cache so changes are picked up
      if (server) {
        const ssrMod = server.moduleGraph.getModuleById('\0' + SERVER_PREFIX + id)
        if (ssrMod) server.moduleGraph.invalidateModule(ssrMod)
      }

      // Return client transform: server functions replaced with RPC stubs
      return { code: buildClientCode(code, id, fns) }
    },

    configureServer(_server) {
      server = _server

      const wsApi = getWsApi(_server)
      if (!wsApi) {
        throw new Error(
          '@v43/plugin-rpc requires @v43/plugin-ws. Add wsPlugin() before rpcPlugin().',
        )
      }

      interface RpcCallPayload {
        id: string
        moduleId: string
        fn: string
        args: unknown[]
      }

      wsApi.onClientMessage<RpcCallPayload>('v43:rpc:call', async (data, client) => {
        try {
          const mod = await _server.ssrLoadModule(SERVER_PREFIX + data.moduleId)
          const serverFns = mod.__v43_server_fns as
            | Record<string, (...args: unknown[]) => unknown>
            | undefined
          const fn = serverFns?.[data.fn]
          if (!fn) throw new Error(`Unknown server function: ${data.fn}`)
          const result = await fn(...data.args)
          client.send('v43:rpc:result', { id: data.id, result })
        } catch (err) {
          client.send('v43:rpc:error', {
            id: data.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    },
  }
}

// --- Minimal AST node types for the subset we inspect ---

interface AstPosition {
  start: number
  end: number
}

interface AstIdentifier extends AstPosition {
  type: 'Identifier'
  name: string
}

interface AstLiteral extends AstPosition {
  type: 'Literal'
  value: unknown
}

interface AstExpressionStatement extends AstPosition {
  type: 'ExpressionStatement'
  expression: AstLiteral
}

interface AstBlockStatement extends AstPosition {
  type: 'BlockStatement'
  body: AstNode[]
}

interface AstFunctionNode extends AstPosition {
  type: 'FunctionDeclaration' | 'ArrowFunctionExpression' | 'FunctionExpression'
  id?: AstIdentifier
  body: AstBlockStatement
}

interface AstVariableDeclarator extends AstPosition {
  id?: AstIdentifier
  init?: AstFunctionNode
}

type AstNode = AstPosition & {
  type: string
  id?: AstIdentifier
  declaration?: AstNode
  declarations?: AstVariableDeclarator[]
  body?: AstBlockStatement | AstNode[]
  init?: AstFunctionNode
}

interface AstProgram {
  body: AstNode[]
}

// --- Helpers ---

interface ServerFnInfo {
  name: string
  node: AstPosition
  isExported: boolean
  isVarDecl: boolean
  directiveNode: AstPosition
}

function findServerFunctions(ast: AstProgram, _code: string): ServerFnInfo[] {
  const results: ServerFnInfo[] = []

  for (const node of ast.body) {
    let target: AstNode = node
    let isExported = false

    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      isExported = true
      target = node.declaration
    }

    let fnNode: AstNode | null = null
    let name = ''
    let isVarDecl = false

    if (target.type === 'FunctionDeclaration' && target.id) {
      fnNode = target
      name = target.id.name
    } else if (
      target.type === 'VariableDeclaration' &&
      target.declarations &&
      target.declarations.length === 1
    ) {
      const decl = target.declarations[0]
      if (
        decl.init?.type === 'ArrowFunctionExpression' ||
        decl.init?.type === 'FunctionExpression'
      ) {
        fnNode = decl.init
        name = decl.id?.name ?? ''
        isVarDecl = true
      }
    }

    if (!fnNode || !name) continue
    const body = fnNode.body
    if (!body || !('type' in body) || body.type !== 'BlockStatement') continue

    const blockBody = body as AstBlockStatement
    const firstStmt = blockBody.body[0]
    if (
      firstStmt?.type === 'ExpressionStatement' &&
      (firstStmt as AstExpressionStatement).expression?.type === 'Literal' &&
      (firstStmt as AstExpressionStatement).expression.value === 'use server'
    ) {
      results.push({ name, node, isExported, isVarDecl, directiveNode: firstStmt })
    }
  }

  return results
}

/** Build a virtual server module containing only imports + server functions */
function buildServerModule(code: string, ast: AstProgram, fns: ServerFnInfo[]): string {
  const fnNames = new Set(fns.map((f) => f.name))
  const parts: string[] = []

  for (const node of ast.body) {
    // Keep all imports (server functions may use any of them)
    if (node.type === 'ImportDeclaration') {
      parts.push(code.slice(node.start, node.end))
      continue
    }

    // Check if this node is a server function
    let target: AstNode = node
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      target = node.declaration
    }

    let name = ''
    if (target.type === 'FunctionDeclaration' && target.id) {
      name = target.id.name
    } else if (target.type === 'VariableDeclaration' && target.declarations?.[0]?.id) {
      name = target.declarations[0].id.name
    }

    if (fnNames.has(name)) {
      const fn = fns.find((f) => f.name === name)!
      let fnCode = code.slice(node.start, node.end)
      // Remove the "use server" directive
      const relStart = fn.directiveNode.start - node.start
      const relEnd = fn.directiveNode.end - node.start
      fnCode = fnCode.slice(0, relStart) + fnCode.slice(relEnd)
      // Ensure exported so __v43_server_fns can reference it
      if (!fn.isExported) fnCode = 'export ' + fnCode
      parts.push(fnCode)
    }
  }

  parts.push(`export const __v43_server_fns = { ${[...fnNames].join(', ')} }`)
  return parts.join('\n')
}

/** Replace server functions with RPC stubs, add runtime import */
function buildClientCode(code: string, moduleId: string, fns: ServerFnInfo[]): string {
  // Sort descending by position so string splicing doesn't shift offsets
  const sorted = [...fns].sort((a, b) => b.node.start - a.node.start)

  let result = code
  for (const fn of sorted) {
    const prefix = fn.isExported ? 'export ' : ''
    const mid = JSON.stringify(moduleId)
    const fname = JSON.stringify(fn.name)
    const stub = fn.isVarDecl
      ? `${prefix}const ${fn.name} = async (...__v43_args) => __v43_rpc(${mid}, ${fname}, __v43_args)`
      : `${prefix}async function ${fn.name}(...__v43_args) { return __v43_rpc(${mid}, ${fname}, __v43_args) }`
    result = result.slice(0, fn.node.start) + stub + result.slice(fn.node.end)
  }

  return `import { __v43_rpc } from '${RUNTIME_PATH}'\n` + result
}

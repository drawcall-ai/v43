import type { Plugin, ModuleNode, ResolvedConfig } from 'vite'
import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import { generateHtml } from './html.ts'
import { buildSystemListModule } from './entry.ts'

const ENTRY_VIRTUAL_ID = '/@v43/three-entry'
const SYSTEM_LIST_VIRTUAL_ID = '/@v43/system-list'
const RESOLVED_SYSTEM_LIST_ID = '\0@v43/system-list'
const ENTRY_RUNTIME_FILE = new URL('./entry-runtime.ts', import.meta.url).pathname

export function pluginThree(): Plugin {
  let discoveredSystems: string[] = []
  let projectRoot = ''
  let isBuild = false
  let wroteIndexHtml = false
  const suppressReloadFor = new Set<string>()

  async function discoverSystems(): Promise<string[]> {
    return fg('**/*.system.ts', {
      cwd: projectRoot,
      ignore: ['node_modules/**', 'dist/**'],
      absolute: true,
    })
  }

  return {
    name: 'v43:three',

    config() {
      return {
        optimizeDeps: {
          include: ['three', 'elics', '@preact/signals-core'],
        },
        build: {
          target: 'esnext',
        },
      }
    },

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root
      isBuild = config.command === 'build'
    },

    async buildStart() {
      discoveredSystems = await discoverSystems()
      if (isBuild) {
        const indexPath = path.join(projectRoot, 'index.html')
        if (!fs.existsSync(indexPath)) {
          const splashPath = path.join(projectRoot, 'splash.html')
          const splashContent = fs.existsSync(splashPath)
            ? fs.readFileSync(splashPath, 'utf-8')
            : undefined
          fs.writeFileSync(indexPath, generateHtml(splashContent))
          wroteIndexHtml = true
        }
      }
    },

    closeBundle() {
      if (wroteIndexHtml) {
        const indexPath = path.join(projectRoot, 'index.html')
        if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath)
        wroteIndexHtml = false
      }
    },

    resolveId(id) {
      if (id === ENTRY_VIRTUAL_ID) return ENTRY_RUNTIME_FILE
      if (id === SYSTEM_LIST_VIRTUAL_ID) return RESOLVED_SYSTEM_LIST_ID
      return null
    },

    load(id) {
      if (id === RESOLVED_SYSTEM_LIST_ID) {
        return buildSystemListModule(discoveredSystems, projectRoot, isBuild)
      }
      return null
    },

    // Validate *.system.ts files have a default export
    transform(code, id) {
      if (!id.endsWith('.system.ts')) return null
      if (id.includes('node_modules')) return null
      if (id.startsWith('\0') || id.startsWith('virtual:')) return null

      const ast = this.parse(code)
      const hasDefaultExport = ast.body.some((node: { type: string }) => node.type === 'ExportDefaultDeclaration')

      if (!hasDefaultExport) {
        this.error({
          message: `[v43] System file must have a default export: ${id}`,
          id,
        })
      }

      return null
    },

    configureServer(_server) {
      // Serve generated HTML for root route (before Vite's own middleware)
      _server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0]
        if (urlPath === '/' || urlPath === '/index.html') {
          const splashPath = path.join(projectRoot, 'splash.html')
          const splashContent = fs.existsSync(splashPath)
            ? fs.readFileSync(splashPath, 'utf-8')
            : undefined
          const html = generateHtml(splashContent)
          _server
            .transformIndexHtml(req.url!, html)
            .then((transformed) => {
              res.setHeader('Content-Type', 'text/html')
              res.end(transformed)
            })
            .catch(next)
          return
        }
        next()
      })

      // Suppress Vite's automatic full-reload for system files.
      // System files are loaded via @vite-ignore dynamic imports, so Vite
      // has no HMR boundary for them and defaults to full-reload. We handle
      // their HMR via custom events instead.
      // Patch hot.send on all environments to intercept full-reload.
      // In Vite 6, each environment has its own hot channel.
      // Patch hot.send on server and all environments to intercept full-reload.
      // In Vite 6, each environment has its own hot channel.
      function patchHotSend(hot: { send: Function }) {
        const origSend = hot.send.bind(hot)
        hot.send = function (...args: unknown[]) {
          const payload = args[0] as Record<string, unknown> | undefined
          if (
            payload && typeof payload === 'object' &&
            payload.type === 'full-reload'
          ) {
            const trigger = typeof payload.triggeredBy === 'string' ? payload.triggeredBy : undefined
            if (trigger && suppressReloadFor.has(trigger)) {
              suppressReloadFor.delete(trigger)
              return
            }
            // Blanket full-reload — suppress if any system file is pending
            if (!trigger && suppressReloadFor.size > 0) {
              suppressReloadFor.clear()
              return
            }
          }
          return origSend(...args)
        }
      }

      patchHotSend(_server.hot)
      for (const env of Object.values(_server.environments)) {
        patchHotSend(env.hot)
      }

      _server.watcher.on('add', async (file: string) => {
        if (!file.endsWith('.system.ts')) return
        suppressReloadFor.add(path.resolve(file))
        discoveredSystems = await discoverSystems()
        // Invalidate the system-list virtual module so the next page load
        // (or HMR re-import) gets fresh content with the new system.
        const mod = _server.moduleGraph.getModuleById(RESOLVED_SYSTEM_LIST_ID)
        if (mod) _server.moduleGraph.invalidateModule(mod)
        const relativePath = '/' + path.relative(projectRoot, file).replace(/\\/g, '/')
        _server.hot.send('v43:three:add', { path: relativePath })
      })

      _server.watcher.on('unlink', async (file: string) => {
        if (!file.endsWith('.system.ts')) return
        suppressReloadFor.add(path.resolve(file))
        discoveredSystems = await discoverSystems()
        // Remove the deleted file from Vite's module graph so it doesn't
        // trigger a full-reload when Vite detects the file is gone.
        const fileModules = _server.moduleGraph.getModulesByFile(file)
        if (fileModules) {
          for (const m of fileModules) _server.moduleGraph.invalidateModule(m)
        }
        const listMod = _server.moduleGraph.getModuleById(RESOLVED_SYSTEM_LIST_ID)
        if (listMod) _server.moduleGraph.invalidateModule(listMod)
        const relativePath = '/' + path.relative(projectRoot, file).replace(/\\/g, '/')
        _server.hot.send('v43:three:remove', { path: relativePath })
      })
    },

    handleHotUpdate({ file, server: _server, modules }) {
      // Case A: system file itself changed — send custom HMR, suppress default.
      if (file.endsWith('.system.ts')) {
        suppressReloadFor.add(path.resolve(file))
        const relativePath = '/' + path.relative(projectRoot, file).replace(/\\/g, '/')
        _server.hot.send('v43:three:hmr', { paths: [relativePath] })
        return []
      }

      // Case B: dependency of a system changed — walk importers
      const affectedSystems = new Set<string>()

      function walkImporters(mod: ModuleNode, visited = new Set<ModuleNode>()) {
        if (visited.has(mod)) return
        visited.add(mod)
        if (mod.file?.endsWith('.system.ts')) {
          const relativePath = '/' + path.relative(projectRoot, mod.file).replace(/\\/g, '/')
          affectedSystems.add(relativePath)
          return
        }
        for (const importer of mod.importers) {
          walkImporters(importer, visited)
        }
      }

      for (const mod of modules) {
        walkImporters(mod)
      }

      if (affectedSystems.size > 0) {
        _server.hot.send('v43:three:hmr', { paths: [...affectedSystems] })
        return []
      }

      return undefined
    },
  }
}

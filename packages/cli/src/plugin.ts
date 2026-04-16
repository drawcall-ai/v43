import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WsApi } from '@v43/plugin-ws'
import type { CliResponsePayload, CliErrorPayload } from './types.ts'
import { getWsApi } from '@v43/plugin-ws'

const VIRTUAL_PATH = '/@v43/cli-client'
const CLIENT_FILE = new URL('./client.ts', import.meta.url).pathname

const DEFAULT_TIMEOUT = 30_000

export function cliPlugin(): Plugin {
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  return {
    name: 'v43:cli',
    apply: 'serve',

    resolveId(id) {
      if (id === VIRTUAL_PATH) return CLIENT_FILE
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: VIRTUAL_PATH },
          injectTo: 'head-prepend',
        },
      ]
    },

    configureServer(server) {
      const wsApi = getWsApi(server)
      if (!wsApi) {
        throw new Error(
          '@v43/plugin-cli requires @v43/plugin-ws. Add wsPlugin() before cliPlugin().',
        )
      }

      // Listen for browser responses
      wsApi.onClientMessage<CliResponsePayload>('v43:cli:response', (data) => {
        const entry = pending.get(data.id)
        if (!entry) return
        clearTimeout(entry.timer)
        pending.delete(data.id)
        entry.resolve(data.result)
      })

      wsApi.onClientMessage<CliErrorPayload>('v43:cli:error', (data) => {
        const entry = pending.get(data.id)
        if (!entry) return
        clearTimeout(entry.timer)
        pending.delete(data.id)
        entry.reject(new Error(data.error))
      })

      // HTTP endpoint for CLI commands
      server.middlewares.use('/v43-cli', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const activeClient = wsApi.getActiveClient()
        if (!activeClient) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No browser client connected' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          let input: string
          try {
            const parsed = JSON.parse(body)
            input = parsed.input
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            return
          }

          const id = crypto.randomUUID()

          const timer = setTimeout(() => {
            pending.delete(id)
            res.writeHead(504, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Timeout: no browser response' }))
          }, DEFAULT_TIMEOUT)

          const promise = new Promise<unknown>((resolve, reject) => {
            pending.set(id, { resolve, reject, timer })
          })

          wsApi.sendToClient('v43:cli:command', { id, input })

          promise
            .then((result) => {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ result }))
            })
            .catch((err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              )
            })
        })
      })
    },
  }
}

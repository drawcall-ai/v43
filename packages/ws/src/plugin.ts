import type { Plugin, NormalizedHotChannelClient } from 'vite'
import type { WsApi } from './types.ts'
import { setWsApi } from './types.ts'

const VIRTUAL_PATH = '/@v43/ws-client'
const CLIENT_FILE = new URL('./client.ts', import.meta.url).pathname

export function wsPlugin(): Plugin {
  const clients = new Set<NormalizedHotChannelClient>()
  let primaryClient: NormalizedHotChannelClient | null = null

  const api: WsApi = {
    onClientMessage(_event, _handler) {
      throw new Error('wsPlugin: onClientMessage called before server is configured')
    },
    sendToClient(event, data) {
      if (primaryClient) {
        primaryClient.send(event, data)
      }
    },
    getActiveClient() {
      return primaryClient
    },
    sendToAll(event, data) {
      for (const client of clients) {
        client.send(event, data)
      }
    },
  }

  return {
    name: 'v43:ws',
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
      setWsApi(server, api)

      api.onClientMessage = (event, handler) => {
        server.hot.on(event, handler)
      }

      server.hot.on('v43:ws:register', (_data, client) => {
        clients.add(client)
        primaryClient = client

        // Notify all clients of primary status
        for (const c of clients) {
          c.send('v43:ws:primary', { isPrimary: c === primaryClient })
        }
      })
    },
  }
}

import type { NormalizedHotChannelClient, ViteDevServer } from 'vite'

export const WS_KEY = Symbol.for('v43:ws')

export interface WsApi {
  /** Register a handler for a custom event from the browser */
  onClientMessage<T = unknown>(
    event: string,
    handler: (data: T, client: NormalizedHotChannelClient) => void,
  ): void

  /** Send a message to the active client. No-op if no client is connected. */
  sendToClient(event: string, data: unknown): void

  /** Get the currently active client, or null if none is connected */
  getActiveClient(): NormalizedHotChannelClient | null

  /** Send a message to all connected clients */
  sendToAll(event: string, data: unknown): void
}

// Symbol-keyed properties can't be expressed in ViteDevServer's type,
// so we use a typed wrapper around a WeakMap instead of patching the object.
const wsApiStore = new WeakMap<ViteDevServer, WsApi>()

/** Read the WsApi stored on a ViteDevServer by the ws plugin */
export function getWsApi(server: ViteDevServer): WsApi | undefined {
  return wsApiStore.get(server)
}

/** Store the WsApi on a ViteDevServer */
export function setWsApi(server: ViteDevServer, api: WsApi): void {
  wsApiStore.set(server, api)
}

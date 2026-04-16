import type { Plugin } from 'vite'

const VIRTUAL_PATH = '/@v43/drop-client'
const CLIENT_FILE = new URL('./client.ts', import.meta.url).pathname

export function pluginDrop(): Plugin {
  return {
    name: 'v43:drop',
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
  }
}

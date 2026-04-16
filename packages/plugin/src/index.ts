import type { Plugin } from 'vite'
import { wsPlugin } from '@v43/plugin-ws'
import { rpcPlugin } from '@v43/plugin-rpc'
import { cliPlugin } from '@v43/plugin-cli'
import { pluginThree } from '@v43/plugin-three'
import { pluginDrop } from '@v43/plugin-drop'
import { pluginEditor } from '@v43/plugin-editor'

/**
 * Combined V43 plugin — includes ws, rpc, cli, editor, three, and drop.
 * Use in vite.config.ts: `plugins: v43()`
 */
export function v43(): Plugin[] {
  const plugins: Plugin[] = [
    wsPlugin(),
    rpcPlugin(),
    cliPlugin(),
    pluginEditor(),
    pluginThree(),
    pluginDrop(),
  ]
  return plugins
}

/**
 * Tests: "use server" directive — functions that execute on the Vite server
 */
import { System } from '@v43/core'

function getServerInfo() {
  'use server'
  return {
    cwd: process.cwd(),
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.round(process.uptime()),
  }
}

function serverAdd(a: number, b: number) {
  'use server'
  return a + b
}

async function readPackageJson() {
  'use server'
  const fs = await import('node:fs')
  const path = await import('node:path')
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
  return { name: pkg.name, version: pkg.version }
}

export default class RpcSystem extends System() {
  constructor() {
    super()
    ;(async () => {
      const info = await getServerInfo()
      console.log('[rpc] Server info:', info)

      const sum = await serverAdd(42, 58)
      console.log('[rpc] serverAdd(42, 58) =', sum)

      const pkg = await readPackageJson()
      console.log('[rpc] package.json:', pkg)
    })()
  }
}

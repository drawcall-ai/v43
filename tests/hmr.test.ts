/**
 * HMR tests — verify that system add/remove/change updates the live system
 * list without a full page reload. Requires a real server (WebSocket for HMR).
 */
import { test, expect } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Page } from '@playwright/test'

const TEST_APP_ROOT = path.resolve(import.meta.dirname, '../examples/test-app')

/** Read the live system paths from the page (exposed by entry-runtime.ts). */
function getSystemPaths(page: Page): Promise<string[]> {
  return page.evaluate('window.__v43_system_paths') as Promise<string[]>
}

/** Wait until the system paths list satisfies a predicate. */
async function waitForSystems(page: Page, predicate: (paths: string[]) => boolean, timeoutMs = 15_000) {
  await expect(async () => {
    const paths = await getSystemPaths(page)
    expect(predicate(paths)).toBe(true)
  }).toPass({ timeout: timeoutMs })
}

test.describe.configure({ mode: 'serial' })
test.describe('HMR', () => {
  let server: ViteDevServer
  let baseUrl: string

  test.beforeAll(async () => {
    server = await createServer({
      root: TEST_APP_ROOT,
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
    })
    await server.listen()
    const address = server.httpServer!.address() as AddressInfo
    baseUrl = `http://localhost:${address.port}`
  })

  test.afterAll(async () => {
    await server?.close()
  })

  test('delete: system is removed from live list, no page reload', async ({ page }) => {
    const tempFile = path.join(TEST_APP_ROOT, 'src/hmr-del.system.ts')
    fs.writeFileSync(
      tempFile,
      `import { System } from '@v43/core'\nexport default class HmrDelSystem extends System() { update() {} }\n`,
    )
    // Let watcher pick it up
    await new Promise((r) => setTimeout(r, 500))

    try {
      await page.goto(baseUrl)
      await expect(page.locator('#v43-splash')).toBeHidden({ timeout: 30_000 })

      // Verify the system is in the list
      await waitForSystems(page, (paths) => paths.some((p) => p.includes('hmr-del.system.ts')))

      // Set reload marker
      await page.evaluate('window.__no_reload = true')

      // Delete the file
      fs.unlinkSync(tempFile)

      // System should disappear from the live list
      await waitForSystems(page, (paths) => !paths.some((p) => p.includes('hmr-del.system.ts')))

      // Page should not have reloaded
      expect(await page.evaluate('window.__no_reload')).toBe(true)
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }
  })

  test('add: system appears in live list, no page reload', async ({ page }) => {
    await page.goto(baseUrl)
    await expect(page.locator('#v43-splash')).toBeHidden({ timeout: 30_000 })

    const tempFile = path.join(TEST_APP_ROOT, 'src/hmr-add.system.ts')

    try {
      // Verify system is NOT in the list yet
      const before = await getSystemPaths(page)
      expect(before.some((p) => p.includes('hmr-add.system.ts'))).toBe(false)

      // Set reload marker
      await page.evaluate('window.__no_reload = true')

      // Create the system
      fs.writeFileSync(
        tempFile,
        `import { System } from '@v43/core'\nexport default class HmrAddSystem extends System() { update() {} }\n`,
      )

      // System should appear in the live list
      await waitForSystems(page, (paths) => paths.some((p) => p.includes('hmr-add.system.ts')))

      // Page should not have reloaded
      expect(await page.evaluate('window.__no_reload')).toBe(true)
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }
  })

  test('change: old system removed, new version registered, no page reload', async ({ page }) => {
    const tempFile = path.join(TEST_APP_ROOT, 'src/hmr-change.system.ts')
    fs.writeFileSync(
      tempFile,
      `import { System } from '@v43/core'
export default class HmrChangeSystem extends System() {
  constructor() { super(); console.log('[hmr-change] v1') }
  update() {}
}
`,
    )
    await new Promise((r) => setTimeout(r, 500))

    try {
      const logs: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'log') logs.push(msg.text())
      })

      await page.goto(baseUrl)
      await expect(page.locator('#v43-splash')).toBeHidden({ timeout: 30_000 })

      // v1 constructor should have logged
      expect(logs.some((l) => l.includes('[hmr-change] v1'))).toBe(true)

      // Set reload marker
      await page.evaluate('window.__no_reload = true')

      // Change to v2
      fs.writeFileSync(
        tempFile,
        `import { System } from '@v43/core'
export default class HmrChangeSystem extends System() {
  constructor() { super(); console.log('[hmr-change] v2') }
  update() {}
}
`,
      )

      // Wait for v2 constructor to fire (system was unregistered then re-registered)
      await expect(async () => {
        expect(logs.some((l) => l.includes('[hmr-change] v2'))).toBe(true)
      }).toPass({ timeout: 5000 })

      // System path is still in the list (same path, new class)
      const paths = await getSystemPaths(page)
      expect(paths.some((p) => p.includes('hmr-change.system.ts'))).toBe(true)

      // Page should not have reloaded
      expect(await page.evaluate('window.__no_reload')).toBe(true)
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    }
  })
})

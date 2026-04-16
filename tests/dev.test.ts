import { test, expect } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import path from 'node:path'
import { serveMiddlewareViaRoute, TEST_ORIGIN } from './serve-middleware.ts'

const TEST_APP_ROOT = path.resolve(import.meta.dirname, '../examples/test-app')

test.describe('dev server (portless)', () => {
  let server: ViteDevServer

  test.beforeAll(async () => {
    server = await createServer({
      root: TEST_APP_ROOT,
      logLevel: 'silent',
      server: { middlewareMode: true },
    })
  })

  test.afterAll(async () => {
    await server?.close()
  })

  test('HTML contains canvas and virtual entry reference', async ({ page }) => {
    await serveMiddlewareViaRoute(page, server.middlewares)
    const response = await page.goto(TEST_ORIGIN)

    expect(response?.status()).toBe(200)
    const html = await response?.text()
    expect(html).toContain('<canvas id="v43-canvas">')
    expect(html).toContain('/@v43/three-entry')
  })

  test('virtual entry module resolves and contains Three.js setup', async () => {
    // Use Vite's internal transform API (bypasses HTTP/FS security)
    const result = await server.transformRequest('/@v43/three-entry')
    expect(result).toBeTruthy()
    expect(result!.code).toContain('WebGLRenderer')
    expect(result!.code).toContain('Scene')
    expect(result!.code).toContain('systemEntries')
  })

  test('system-list virtual module resolves with discovered systems', async () => {
    const result = await server.transformRequest('/@v43/system-list')
    expect(result).toBeTruthy()
    expect(result!.code).toContain('systemEntries')
    expect(result!.code).toContain('.system.ts')
  })
})

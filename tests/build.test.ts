/**
 * Production build tests — build once, then verify output files and
 * serve dist/ via Playwright route interception (no port, pure JS).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { serveDistViaRoute, TEST_ORIGIN } from './serve-dist.ts'

const TEST_APP_ROOT = path.resolve(import.meta.dirname, '../examples/test-app')
const DIST_DIR = path.join(TEST_APP_ROOT, 'dist')

test.beforeAll(() => {
  execSync('npx vite build', { cwd: TEST_APP_ROOT, stdio: 'pipe' })
})

test('build output: HTML and JS exist, no unresolved virtual paths, temp file cleaned up', () => {
  // index.html exists and has the right structure
  const html = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8')
  expect(html).toContain('<canvas id="v43-canvas">')
  expect(html).toContain('v43-splash')
  expect(html).not.toContain('/@v43/')
  expect(html).not.toContain('/@fs/')

  // JS bundle exists and has no broken virtual paths
  const assets = fs.readdirSync(path.join(DIST_DIR, 'assets'))
  const jsFile = assets.find((f) => f.endsWith('.js'))
  expect(jsFile).toBeTruthy()
  const js = fs.readFileSync(path.join(DIST_DIR, 'assets', jsFile!), 'utf-8')
  expect(js).not.toContain('/@v43/')
  expect(js).not.toContain('/@fs/')

  // Temp index.html was cleaned up from project root
  expect(fs.existsSync(path.join(TEST_APP_ROOT, 'index.html'))).toBe(false)
})

test('build serves via virtual files: scene renders and splash removed', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('RPC is only available')) {
      errors.push(msg.text())
    }
  })

  await serveDistViaRoute(page, DIST_DIR)
  await page.goto(TEST_ORIGIN)

  await expect(page.locator('#v43-splash')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#v43-canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('build serves via virtual files: RPC stubs reject gracefully', async ({ page }) => {
  const rpcErrors: string[] = []
  page.on('pageerror', (err) => {
    if (err.message.includes('RPC')) rpcErrors.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('RPC is only available')) {
      rpcErrors.push(msg.text())
    }
  })

  await serveDistViaRoute(page, DIST_DIR)
  await page.goto(TEST_ORIGIN)
  await expect(page.locator('#v43-splash')).toBeHidden({ timeout: 30_000 })

  await expect(page.locator('#v43-canvas')).toBeVisible()
  expect(rpcErrors.some((e) => e.includes('RPC is only available in development mode'))).toBe(true)
})

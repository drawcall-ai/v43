/**
 * Serves files from a dist/ directory through Playwright route interception.
 * No HTTP server, no port — pure JS.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

export const TEST_ORIGIN = 'http://v43-test.local'

export async function serveDistViaRoute(page: Page, distDir: string): Promise<void> {
  await page.route(`${TEST_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    const filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      await route.fulfill({
        status: 200,
        headers: { 'content-type': MIME_TYPES[ext] ?? 'application/octet-stream' },
        body: fs.readFileSync(filePath),
      })
    } else {
      await route.fulfill({ status: 404, body: 'Not Found' })
    }
  })
}

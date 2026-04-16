/**
 * Routes Playwright requests through Vite's Connect middleware.
 * No HTTP server, no port — pure JS request/response piping.
 */
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import type { Connect } from 'vite'
import type { Page } from '@playwright/test'

export const TEST_ORIGIN = 'http://v43-test.local'

interface MiddlewareResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
}

export function callMiddleware(
  middlewares: Connect.Server,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<MiddlewareResponse> {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_c, _e, cb) { cb() } })
    const req = new IncomingMessage(socket as never)
    req.method = method
    req.url = url
    req.headers = { ...headers, host: 'v43-test.local' }

    const res = new ServerResponse(req)
    const chunks: Buffer[] = []

    // Intercept writes to collect the response body.
    // ServerResponse.write/end have complex overloads that can't be
    // cleanly typed without matching every signature, so we cast here.
    const origWrite = res.write.bind(res)
    const origEnd = res.end.bind(res)

    res.write = function (chunk: unknown, ...args: unknown[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
      return origWrite(chunk, ...args as [])
    } as typeof res.write

    res.end = function (chunk?: unknown, ...args: unknown[]) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
      const hdrs: Record<string, string> = {}
      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v !== undefined) hdrs[k] = String(v)
      }
      resolve({ status: res.statusCode, headers: hdrs, body: Buffer.concat(chunks) })
      return origEnd(chunk, ...args as []) as ServerResponse
    } as typeof res.end

    if (body && body.length > 0) req.push(body)
    req.push(null)

    try {
      middlewares.handle(req, res, (err?: unknown) => {
        if (err) reject(err)
        else resolve({ status: 404, headers: {}, body: Buffer.from('Not Found') })
      })
    } catch (e) {
      reject(e)
    }
  })
}

export async function serveMiddlewareViaRoute(
  page: Page,
  middlewares: Connect.Server,
): Promise<void> {
  await page.route(`${TEST_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    try {
      const response = await callMiddleware(
        middlewares,
        request.method(),
        url.pathname + url.search,
        request.headers(),
        request.postDataBuffer() ?? undefined,
      )
      await route.fulfill({
        status: response.status,
        headers: response.headers,
        body: response.body,
      })
    } catch {
      await route.fulfill({ status: 500, body: 'Middleware error' })
    }
  })
}

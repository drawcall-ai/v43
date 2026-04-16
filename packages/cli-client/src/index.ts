export interface CliSendOptions {
  port?: number
  host?: string
}

/**
 * Send a raw command string to the V43 dev server.
 * The command is forwarded to the browser where @v43/cli-handler parses and executes it.
 *
 * @param input - The raw command string, e.g. "screenshot -w 1920"
 * @param options - Optional host/port override
 * @returns The result from the browser-side command handler
 */
export async function cliSend(input: string, options?: CliSendOptions): Promise<any> {
  const port = options?.port ?? 5173
  const host = options?.host ?? 'localhost'
  const url = `http://${host}:${port}/v43-cli`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return data.result
}

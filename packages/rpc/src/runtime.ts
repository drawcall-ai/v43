const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

if (import.meta.hot) {
  import.meta.hot.on('v43:rpc:result', (data: { id: string; result: unknown }) => {
    const p = pending.get(data.id)
    if (p) {
      pending.delete(data.id)
      p.resolve(data.result)
    }
  })
  import.meta.hot.on('v43:rpc:error', (data: { id: string; error: string }) => {
    const p = pending.get(data.id)
    if (p) {
      pending.delete(data.id)
      p.reject(new Error(data.error))
    }
  })
}

export function __v43_rpc(moduleId: string, fn: string, args: unknown[]): Promise<unknown> {
  if (!import.meta.hot) {
    return Promise.reject(new Error('[v43] RPC is only available in development mode: ' + fn))
  }
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('[v43] RPC timeout: ' + fn))
      }
    }, 30000)
    import.meta.hot!.send('v43:rpc:call', { id, moduleId, fn, args })
  })
}

if (import.meta.hot) {
  import.meta.hot.on('v43:cli:command', async (data: { id: string; input: string }) => {
    try {
      const { parseAndExecute } = await import('@v43/cli-handler')
      const result = await parseAndExecute(data.input)
      import.meta.hot!.send('v43:cli:response', { id: data.id, result })
    } catch (err) {
      import.meta.hot!.send('v43:cli:error', {
        id: data.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}

declare global {
  interface Window {
    __v43_isPrimary?: boolean
  }
}

if (import.meta.hot) {
  import.meta.hot.send('v43:ws:register', {})

  import.meta.hot.on('v43:ws:primary', (data: { isPrimary: boolean }) => {
    window.__v43_isPrimary = data.isPrimary
    window.dispatchEvent(
      new CustomEvent('v43:primary-change', { detail: { isPrimary: data.isPrimary } }),
    )
  })

  import.meta.hot.on('v43:ws:active', () => {
    console.log('[v43] This tab is the active client')
  })
}

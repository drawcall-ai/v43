declare global {
  interface Window {
    __v43_isPrimary?: boolean
  }
}

const TOOLBAR_STYLES = `
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font: 11px/1.4 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  color: #bbb;
  user-select: none;
`

const BTN_STYLES = `
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #bbb;
  font: inherit;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
`

const BTN_ACTIVE_BORDER = 'rgba(255, 255, 255, 0.35)'

interface TemplateInfo {
  name: string
  category: string
}

export interface Toolbar {
  element: HTMLDivElement
  setEditorActive(active: boolean): void
  onEditorToggle(cb: (active: boolean) => void): void
  setTemplates(templates: TemplateInfo[]): void
  destroy(): void
}

export function createToolbar(): Toolbar {
  let editorActive = false
  const toggleCallbacks: Array<(active: boolean) => void> = []

  // Root
  const el = document.createElement('div')
  el.setAttribute('style', TOOLBAR_STYLES)

  // --- Indicator dot ---
  const dot = document.createElement('span')
  dot.setAttribute(
    'style',
    `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666;
    flex-shrink: 0;
  `,
  )
  dot.title = 'Secondary connection'
  el.appendChild(dot)

  // Listen for primary status
  const onPrimary = (e: Event) => {
    const isPrimary = (e as CustomEvent<{ isPrimary: boolean }>).detail.isPrimary
    dot.style.background = isPrimary ? '#4f4' : '#666'
    dot.title = isPrimary ? 'Primary connection' : 'Secondary connection'
  }
  window.addEventListener('v43:primary-change', onPrimary)

  // Init from stored value
  if (window.__v43_isPrimary) {
    dot.style.background = '#4f4'
    dot.title = 'Primary connection'
  }

  // --- Separator ---
  const sep1 = document.createElement('span')
  sep1.setAttribute(
    'style',
    'width:1px;height:14px;background:rgba(255,255,255,0.12);flex-shrink:0;',
  )
  el.appendChild(sep1)

  // --- Editor toggle ---
  const editorBtn = document.createElement('button')
  editorBtn.setAttribute('style', BTN_STYLES)
  editorBtn.textContent = 'Editor'
  editorBtn.title = 'Toggle editor mode'
  editorBtn.addEventListener('click', () => {
    setEditorActive(!editorActive)
  })
  el.appendChild(editorBtn)

  // --- Editor tools container (shown when editor active) ---
  const toolsContainer = document.createElement('div')
  toolsContainer.setAttribute('style', 'display:none;align-items:center;gap:6px;')
  el.appendChild(toolsContainer)

  function setEditorActive(active: boolean) {
    editorActive = active
    editorBtn.style.borderColor = active ? BTN_ACTIVE_BORDER : 'rgba(255, 255, 255, 0.12)'
    editorBtn.style.color = active ? '#fff' : '#bbb'
    toolsContainer.style.display = active ? 'flex' : 'none'
    for (const cb of toggleCallbacks) cb(active)
  }

  function setTemplates(templates: TemplateInfo[]) {
    toolsContainer.innerHTML = ''

    // Separator
    const sep = document.createElement('span')
    sep.setAttribute(
      'style',
      'width:1px;height:14px;background:rgba(255,255,255,0.12);flex-shrink:0;',
    )
    toolsContainer.appendChild(sep)

    // Group by category
    const grouped = new Map<string, TemplateInfo[]>()
    for (const t of templates) {
      if (!grouped.has(t.category)) grouped.set(t.category, [])
      grouped.get(t.category)!.push(t)
    }

    for (const [category, items] of grouped) {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('style', 'position:relative;')

      const btn = document.createElement('button')
      btn.setAttribute('style', BTN_STYLES)
      btn.textContent = `+ ${category.charAt(0).toUpperCase() + category.slice(1)}`
      btn.title = `Add ${category}`

      const dropdown = document.createElement('div')
      dropdown.setAttribute(
        'style',
        `
        display: none;
        position: absolute;
        bottom: calc(100% + 4px);
        left: 0;
        background: rgba(30, 30, 30, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 2px 0;
        min-width: 140px;
        z-index: 10001;
      `,
      )

      for (const item of items) {
        const option = document.createElement('div')
        option.setAttribute(
          'style',
          `
          padding: 4px 10px;
          cursor: pointer;
          white-space: nowrap;
          font: inherit;
          color: #bbb;
        `,
        )
        option.textContent = item.name
        option.addEventListener('mouseenter', () => {
          option.style.background = 'rgba(255,255,255,0.08)'
          option.style.color = '#fff'
        })
        option.addEventListener('mouseleave', () => {
          option.style.background = 'none'
          option.style.color = '#bbb'
        })
        option.addEventListener('click', () => {
          dropdown.style.display = 'none'
          if (import.meta.hot) {
            import.meta.hot.send('v43:editor:add', { templateName: item.name })
          }
        })
        dropdown.appendChild(option)
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const isOpen = dropdown.style.display === 'block'
        // Close all dropdowns first
        for (const d of toolsContainer.querySelectorAll('[data-dropdown]')) {
          if (d instanceof HTMLElement) d.style.display = 'none'
        }
        dropdown.style.display = isOpen ? 'none' : 'block'
      })

      dropdown.setAttribute('data-dropdown', '')

      wrapper.appendChild(btn)
      wrapper.appendChild(dropdown)
      toolsContainer.appendChild(wrapper)
    }
  }

  // Close dropdowns on outside click (registered once)
  const onClickOutside = () => {
    for (const d of toolsContainer.querySelectorAll('[data-dropdown]')) {
      if (d instanceof HTMLElement) d.style.display = 'none'
    }
  }
  document.addEventListener('click', onClickOutside)

  document.body.appendChild(el)

  return {
    element: el,
    setEditorActive,
    onEditorToggle(cb) {
      toggleCallbacks.push(cb)
    },
    setTemplates,
    destroy() {
      window.removeEventListener('v43:primary-change', onPrimary)
      document.removeEventListener('click', onClickOutside)
      el.remove()
    },
  }
}

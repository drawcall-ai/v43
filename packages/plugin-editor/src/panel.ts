import { Pane } from 'tweakpane'
import type { BladeApi } from 'tweakpane'
import { world, systems, resourceStore } from '@v43/core'
import type { SystemEntry } from '@v43/core'
import type { Object3D } from 'three'
import type { Signal } from '@preact/signals-core'
import type { Query } from 'elics'

let pane: Pane | null = null
let container: HTMLDivElement | null = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
let lastSystemCount = -1
let lastSceneChildCount = -1

function rebuildPane() {
  if (!pane || !container) return
  pane.dispose()
  pane = new Pane({ container, title: 'V43 Editor' })
  buildSystemsSection()
  buildQueriesSection()
  buildSceneSection()
  lastSystemCount = systems.length
  const sceneSignal = resourceStore.get('Scene') as Signal<Object3D | null> | undefined
  lastSceneChildCount = sceneSignal?.value?.children?.length ?? -1
}

export function createPanel() {
  if (pane) return

  container = document.createElement('div')
  container.setAttribute(
    'style',
    `
    position: fixed;
    top: 8px;
    right: 8px;
    width: 320px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    z-index: 10000;
  `,
  )
  document.body.appendChild(container)

  pane = new Pane({ container, title: 'V43 Editor' })

  buildSystemsSection()
  buildQueriesSection()
  buildSceneSection()
  lastSystemCount = systems.length
  const sceneSignal = resourceStore.get('Scene') as Signal<Object3D | null> | undefined
  lastSceneChildCount = sceneSignal?.value?.children?.length ?? -1

  refreshInterval = setInterval(() => {
    if (!pane) return
    const currentSysCount = systems.length
    const currentSceneSignal = resourceStore.get('Scene') as Signal<Object3D | null> | undefined
    const currentSceneChildren = currentSceneSignal?.value?.children?.length ?? -1
    if (currentSysCount !== lastSystemCount || currentSceneChildren !== lastSceneChildCount) {
      rebuildPane()
      return
    }
    pane.refresh()
  }, 500)
}

export function destroyPanel() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  for (const timer of debounceTimers.values()) clearTimeout(timer)
  debounceTimers.clear()

  if (pane) {
    pane.dispose()
    pane = null
  }
  if (container) {
    container.remove()
    container = null
  }
}

// --- Systems Section ---

function addTextBlade(
  folder: { addBlade(params: Record<string, unknown>): BladeApi },
  label: string,
  value: string,
) {
  folder.addBlade({ view: 'text', label, parse: (v: string) => v, value })
}

function buildSystemsSection() {
  if (!pane) return

  const folder = pane.addFolder({ title: 'Systems', expanded: true })

  if (!world || systems.length === 0) {
    addTextBlade(folder, 'status', 'No systems loaded')
    return
  }

  for (const entry of systems) {
    const sys = world.getSystem(entry.SystemClass)
    if (!sys) continue

    const name = filenameFromPath(entry.path)
    const sysFolder = folder.addFolder({ title: name, expanded: false })

    // Config inputs
    const configObj = sys.config
    const schemaObj = entry.SystemClass.schema
    if (configObj && typeof configObj === 'object') {
      const configProxy: Record<string, unknown> = {}

      for (const [key, sig] of Object.entries(configObj)) {
        configProxy[key] = sig.value

        // Check if this field is an Enum — render as dropdown
        const fieldSchema = schemaObj?.[key]
        const bindingOpts: Record<string, unknown> = {}
        if (fieldSchema?.type === 'Enum' && fieldSchema.enum) {
          bindingOpts.options = Object.entries(fieldSchema.enum).map(([label, value]) => ({
            text: label,
            value,
          }))
        }

        sysFolder
          .addBinding(configProxy, key, bindingOpts)
          .on('change', (ev: { value: unknown }) => {
            // Update the signal live
            sig.value = ev.value

            // Debounced file regeneration
            const timerKey = `${entry.path}:config`
            if (debounceTimers.has(timerKey)) clearTimeout(debounceTimers.get(timerKey)!)
            debounceTimers.set(
              timerKey,
              setTimeout(() => {
                debounceTimers.delete(timerKey)
                if (import.meta.hot) {
                  import.meta.hot.send('v43:editor:update-config', {
                    filePath: entry.path,
                    config: { ...configProxy },
                  })
                }
              }, 300),
            )
          })
      }
    }

    // Delete button
    sysFolder.addButton({ title: 'Delete System' }).on('click', async () => {
      const deleteFn = entry.SystemClass.__v43_delete
      if (deleteFn) {
        await deleteFn()
      } else if (import.meta.hot) {
        import.meta.hot.send('v43:editor:delete', { filePath: entry.path })
      }
    })
  }
}

// --- Queries Section ---

function buildQueriesSection() {
  if (!pane || !world) return

  const folder = pane.addFolder({ title: 'Queries', expanded: false })

  let hasQueries = false

  for (const entry of systems) {
    const sys = world.getSystem(entry.SystemClass)
    if (!sys) continue

    const queries = sys.queries

    for (const [queryName, query] of Object.entries(queries)) {
      hasQueries = true

      const count = query.entities.size
      const name = filenameFromPath(entry.path)
      const qFolder = folder.addFolder({
        title: `${name} / ${queryName} (${count})`,
        expanded: false,
      })

      buildEntityTable(qFolder, query)
    }
  }

  if (!hasQueries) {
    addTextBlade(folder, 'status', 'No queries')
  }
}

function buildEntityTable(
  folder: ReturnType<Pane['addFolder']>,
  query: Query,
) {
  if (query.entities.size === 0) {
    addTextBlade(folder, 'info', 'No entities')
    return
  }

  let idx = 0
  for (const entity of query.entities) {
    if (idx >= 50) break // Cap display
    const entityFolder = folder.addFolder({
      title: `Entity ${entity.index}`,
      expanded: false,
    })

    for (const comp of entity.getComponents()) {
      if (!comp.schema) continue
      for (const key of Object.keys(comp.schema)) {
        const val = entity.getValue(comp, key)
        if (val !== undefined && val !== null) {
          const monitor: Record<string, unknown> = {}
          monitor[`${comp.id}.${key}`] = val
          entityFolder.addBinding(monitor, `${comp.id}.${key}`, { readonly: true })
        }
      }
    }
    idx++
  }
}

// --- Scene Section ---

function buildSceneSection() {
  if (!pane) return

  const folder = pane.addFolder({ title: 'Scene', expanded: false })

  const sceneSignal = resourceStore.get('Scene') as Signal<Object3D | null> | undefined
  const scene = sceneSignal?.value
  if (!scene) {
    addTextBlade(folder, 'status', 'No scene')
    return
  }

  buildSceneNode(folder, scene)
}

function buildSceneNode(parent: ReturnType<Pane['addFolder']>, obj: Object3D, depth = 0) {
  if (depth > 10) return // Prevent infinite recursion

  for (const child of obj.children) {
    const label = child.name || child.type || 'Object3D'
    const hasChildren = child.children.length > 0

    const nodeFolder = parent.addFolder({
      title: label,
      expanded: false,
    })

    // Position
    const pos = { x: child.position.x, y: child.position.y, z: child.position.z }
    nodeFolder.addBinding(pos, 'x', { readonly: true, label: 'pos.x' })
    nodeFolder.addBinding(pos, 'y', { readonly: true, label: 'pos.y' })
    nodeFolder.addBinding(pos, 'z', { readonly: true, label: 'pos.z' })

    // Rotation (degrees)
    const rot = {
      x: child.rotation.x * (180 / Math.PI),
      y: child.rotation.y * (180 / Math.PI),
      z: child.rotation.z * (180 / Math.PI),
    }
    nodeFolder.addBinding(rot, 'x', { readonly: true, label: 'rot.x' })
    nodeFolder.addBinding(rot, 'y', { readonly: true, label: 'rot.y' })
    nodeFolder.addBinding(rot, 'z', { readonly: true, label: 'rot.z' })

    // Scale
    const scl = { x: child.scale.x, y: child.scale.y, z: child.scale.z }
    nodeFolder.addBinding(scl, 'x', { readonly: true, label: 'scl.x' })
    nodeFolder.addBinding(scl, 'y', { readonly: true, label: 'scl.y' })
    nodeFolder.addBinding(scl, 'z', { readonly: true, label: 'scl.z' })

    // Visible
    const vis = { visible: child.visible }
    nodeFolder.addBinding(vis, 'visible', { readonly: true })

    if (hasChildren) {
      buildSceneNode(nodeFolder, child, depth + 1)
    }
  }
}

// --- Helpers ---

function filenameFromPath(p: string): string {
  const parts = p.split('/')
  const file = parts[parts.length - 1]
  return file.replace('.system.ts', '')
}

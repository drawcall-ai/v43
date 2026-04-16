/**
 * V43 Three.js entry runtime — type-checked, imported as a virtual module.
 *
 * The plugin resolves `/@v43/three-entry` to this file and provides
 * `/@v43/system-list` as a virtual module exporting `systemEntries`.
 */

import { WebGLRenderer, Scene, PerspectiveCamera, Timer } from 'three'
import { World } from 'elics'
import { signal } from '@preact/signals-core'
import {
  resourceStore,
  editorActive,
  __editorFrameCallback,
  __setWorld,
  __setSystems,
  __setEditorCamera,
} from '@v43/core'
import type { SystemEntry } from '@v43/core'

// This virtual module is provided by the plugin — static imports for build,
// dynamic imports for dev. It exports `systemEntries: SystemEntry[]`.
import { systemEntries } from '/@v43/system-list'

// --- Three.js boilerplate ---

const canvas = document.getElementById('v43-canvas') as HTMLCanvasElement
const renderer = new WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new Scene()
const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
camera.position.z = 5

const editorCamera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
editorCamera.position.set(5, 5, 5)
editorCamera.lookAt(0, 0, 0)
__setEditorCamera(editorCamera)

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  editorCamera.aspect = innerWidth / innerHeight
  editorCamera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// --- Populate shared resource store ---

resourceStore.set('Scene', signal(scene))
resourceStore.set('Camera', signal(camera))
resourceStore.set('Renderer', signal(renderer))
resourceStore.set('Canvas', signal(canvas))

// --- ECS World ---

const world = new World()
__setWorld(world)

// --- Register systems ---

for (const entry of systemEntries) {
  world.registerSystem(entry.SystemClass)
}
__setSystems(systemEntries)

// Expose system paths for testing / debugging
function updateSystemPaths() {
  ;(window as Record<string, unknown>).__v43_system_paths = systemEntries.map((e) => e.path)
}
updateSystemPaths()

// --- Startup gate ---

// V43 systems extend elics System with isReady(). elics types don't
// declare it, so we define the shape we need for the runtime checks.
interface V43System {
  isPaused: boolean
  constructor: { isAsync?: boolean }
  isReady(): { value: unknown } | boolean
}

function readReady(sys: V43System) {
  const ready = sys.isReady()
  if (ready && typeof ready === 'object' && 'value' in ready) return ready.value
  return ready
}

let appStarted = false

function checkAppReady(): boolean {
  if (appStarted) return true
  for (const sys of world.getSystems() as unknown as V43System[]) {
    if (sys.constructor.isAsync) continue
    if (!readReady(sys)) return false
  }
  appStarted = true
  canvas.style.visibility = 'visible'
  const splash = document.getElementById('v43-splash')
  if (splash) splash.remove()
  return true
}

// --- Render loop ---

const timer = new Timer()
renderer.setAnimationLoop(() => {
  timer.update()
  const delta = timer.getDelta()
  const time = timer.getElapsed()

  checkAppReady()

  for (const sys of world.getSystems() as unknown as V43System[]) {
    sys.isPaused = !readReady(sys)
  }

  world.update(delta, time)
  if (__editorFrameCallback) __editorFrameCallback()
  renderer.render(scene, editorActive.value ? editorCamera : camera)
})

// --- HMR (tree-shaken in production) ---

if (import.meta.hot) {
  import.meta.hot.on('v43:three:hmr', async (data: { paths: string[] }) => {
    for (const p of data.paths) {
      const entry = systemEntries.find((s) => s.path === p)
      if (!entry) continue

      world.unregisterSystem(entry.SystemClass)

      const mod = await import(/* @vite-ignore */ p + '?t=' + Date.now())
      entry.SystemClass = mod.default

      world.registerSystem(entry.SystemClass)
    }
    __setSystems([...systemEntries])
    updateSystemPaths()
  })

  import.meta.hot.on('v43:three:add', async (data: { path: string }) => {
    const existing = systemEntries.find((s) => s.path === data.path)
    if (existing) return
    const mod = await import(/* @vite-ignore */ data.path + '?t=' + Date.now())
    if (!mod.default) return
    const entry: SystemEntry = { path: data.path, SystemClass: mod.default }
    systemEntries.push(entry)
    world.registerSystem(entry.SystemClass)
    __setSystems([...systemEntries])
    updateSystemPaths()
  })

  import.meta.hot.on('v43:three:remove', async (data: { path: string }) => {
    const idx = systemEntries.findIndex((s) => s.path === data.path)
    if (idx === -1) return
    world.unregisterSystem(systemEntries[idx].SystemClass)
    systemEntries.splice(idx, 1)
    __setSystems([...systemEntries])
    updateSystemPaths()
  })
}

import type { Scene, PerspectiveCamera } from 'three'
import { CameraHelper, DirectionalLight, DirectionalLightHelper } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Signal } from '@preact/signals-core'
import { resourceStore, editorCamera, editorActive, __setEditorFrameCallback } from '@v43/core'
import { createToolbar } from './toolbar.ts'
import { createPanel, destroyPanel } from './panel.ts'

const toolbar = createToolbar()

let orbitControls: OrbitControls | null = null
let cameraHelper: CameraHelper | null = null
let dirLightHelpers: DirectionalLightHelper[] = []

function getResource<T>(key: string): T | undefined {
  const signal = resourceStore.get(key) as Signal<T | null> | undefined
  return signal?.value ?? undefined
}

function enableEditor() {
  editorActive.value = true

  const scene = getResource<Scene>('Scene')
  const camera = getResource<PerspectiveCamera>('Camera')
  const canvas = getResource<HTMLCanvasElement>('Canvas')

  if (editorCamera && canvas && !orbitControls) {
    orbitControls = new OrbitControls(editorCamera, canvas)
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.1
  }

  // Add camera helper for the game camera
  if (scene && camera && !cameraHelper) {
    cameraHelper = new CameraHelper(camera)
    scene.add(cameraHelper)
  }

  // Add directional light helpers
  if (scene) {
    scene.traverse((obj) => {
      if (obj instanceof DirectionalLight) {
        const helper = new DirectionalLightHelper(obj)
        scene.add(helper)
        dirLightHelpers.push(helper)
      }
    })
  }

  __setEditorFrameCallback(() => {
    if (orbitControls) orbitControls.update()
    if (cameraHelper) cameraHelper.update()
    for (const h of dirLightHelpers) h.update()
  })

  createPanel()
}

function disableEditor() {
  editorActive.value = false
  __setEditorFrameCallback(null)

  if (orbitControls) {
    orbitControls.dispose()
    orbitControls = null
  }

  if (cameraHelper) {
    cameraHelper.removeFromParent()
    cameraHelper.dispose()
    cameraHelper = null
  }

  for (const h of dirLightHelpers) {
    h.removeFromParent()
    h.dispose()
  }
  dirLightHelpers = []

  destroyPanel()
}

// Auto-enable editor from URL param
if (new URL(location.href).searchParams.has('editor')) {
  // Defer to let the scene initialize first
  requestAnimationFrame(() => {
    toolbar.setEditorActive(true)
  })
}

toolbar.onEditorToggle((active) => {
  if (active) {
    enableEditor()
  } else {
    disableEditor()
  }
})

// Request templates from server
if (import.meta.hot) {
  import.meta.hot.on(
    'v43:editor:templates',
    (data: { templates: Array<{ name: string; category: string }> }) => {
      toolbar.setTemplates(data.templates)
    },
  )

  // Request on load
  import.meta.hot.send('v43:editor:get-templates', {})
}

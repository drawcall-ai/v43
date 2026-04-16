/**
 * Generate the source code for a spawn system that loads a colocated GLTF file.
 */
export function generateSpawnSystem(
  className: string,
  gltfFilename: string,
  folderPath: string,
): string {
  return `// @v43-template: gltf-model
import { System, resource } from '@v43/core'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import modelUrl from './${gltfFilename}?url'

const loader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
loader.setDRACOLoader(dracoLoader)

async function deleteSystem() {
  "use server"
  const fs = await import('node:fs')
  fs.rmSync('${folderPath}', { recursive: true, force: true })
}

export default class ${className} extends System({
  delete: deleteSystem,
  config: {
    posX: { type: 'Float32', default: 0 },
    posY: { type: 'Float32', default: 0 },
    posZ: { type: 'Float32', default: 0 },
  },
}) {
  private scene = this.load('Scene')
  private model = resource(() => loader.loadAsync(modelUrl))

  constructor() {
    super()
    this.effect(() => {
      const gltf = this.model.value
      if (!gltf) return
      gltf.scene.position.set(this.config.posX.value, this.config.posY.value, this.config.posZ.value)
      this.scene.value!.add(gltf.scene)
      return () => this.scene.value!.remove(gltf.scene)
    })
  }
}
`
}

export { toPascalCase, toKebabCase } from '@v43/core'

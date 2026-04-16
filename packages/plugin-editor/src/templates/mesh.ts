import type { SystemTemplate } from './index.ts'

const GEOMETRY_ENUM = `{ Box: 'box', Sphere: 'sphere', Plane: 'plane' }`

export const meshTemplate: SystemTemplate = {
  name: 'Mesh',
  marker: 'mesh',
  category: 'mesh',
  filePrefix: 'mesh',
  configFields: {
    geometry: { type: 'Enum', default: 'box', label: 'Geometry' },
    width: { type: 'Float32', default: 1.0, label: 'Width' },
    height: { type: 'Float32', default: 1.0, label: 'Height' },
    depth: { type: 'Float32', default: 1.0, label: 'Depth' },
    color: { type: 'String', default: '#4488aa', label: 'Color' },
    posX: { type: 'Float32', default: 0.0, label: 'Position X' },
    posY: { type: 'Float32', default: 0.0, label: 'Position Y' },
    posZ: { type: 'Float32', default: 0.0, label: 'Position Z' },
  },
  generate(config, className) {
    return `// @v43-template: mesh
import { System } from '@v43/core'
import { Mesh, BoxGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial, Color, DoubleSide } from 'three'

function createGeometry(type: string, w: number, h: number, d: number) {
  switch (type) {
    case 'sphere': return new SphereGeometry(w / 2, 32, 32)
    case 'plane': return new PlaneGeometry(w, h)
    default: return new BoxGeometry(w, h, d)
  }
}

export default class ${className} extends System({
  config: {
    geometry: { type: 'Enum', default: '${config.geometry}', enum: ${GEOMETRY_ENUM} },
    width: { type: 'Float32', default: ${config.width} },
    height: { type: 'Float32', default: ${config.height} },
    depth: { type: 'Float32', default: ${config.depth} },
    color: { type: 'String', default: '${config.color}' },
    posX: { type: 'Float32', default: ${config.posX} },
    posY: { type: 'Float32', default: ${config.posY} },
    posZ: { type: 'Float32', default: ${config.posZ} },
  },
}) {
  private scene = this.load('Scene')

  constructor() {
    super()
    const geo = createGeometry(this.config.geometry.value, this.config.width.value, this.config.height.value, this.config.depth.value)
    const mat = new MeshStandardMaterial({ color: new Color(this.config.color.value), side: DoubleSide })
    const mesh = new Mesh(geo, mat)
    if (this.config.geometry.value === 'plane') mesh.rotation.x = -Math.PI / 2
    mesh.position.set(this.config.posX.value, this.config.posY.value, this.config.posZ.value)

    this.effect(() => {
      const scene = this.scene.value
      if (!scene) return
      scene.add(mesh)
      return () => {
        scene.remove(mesh)
        geo.dispose()
        mat.dispose()
      }
    })
  }
}
`
  },
}

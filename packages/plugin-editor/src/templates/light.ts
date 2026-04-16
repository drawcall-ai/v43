import type { SystemTemplate } from './index.ts'

export const ambientLightTemplate: SystemTemplate = {
  name: 'Ambient Light',
  marker: 'ambient-light',
  category: 'light',
  filePrefix: 'light',
  configFields: {
    color: { type: 'String', default: '#ffffff', label: 'Color' },
    intensity: { type: 'Float32', default: 1.0, label: 'Intensity' },
  },
  generate(config, className) {
    return `// @v43-template: ambient-light
import { System } from '@v43/core'
import { AmbientLight, Color } from 'three'

export default class ${className} extends System({
  config: {
    color: { type: 'String', default: '${config.color}' },
    intensity: { type: 'Float32', default: ${config.intensity} },
  },
}) {
  private scene = this.load('Scene')

  constructor() {
    super()
    const light = new AmbientLight(new Color(this.config.color.value), this.config.intensity.value)

    this.effect(() => {
      const scene = this.scene.value
      if (!scene) return
      scene.add(light)
      return () => scene.remove(light)
    })
  }
}
`
  },
}

export const directionalLightTemplate: SystemTemplate = {
  name: 'Directional Light',
  marker: 'directional-light',
  category: 'light',
  filePrefix: 'light',
  configFields: {
    color: { type: 'String', default: '#ffffff', label: 'Color' },
    intensity: { type: 'Float32', default: 1.0, label: 'Intensity' },
    posX: { type: 'Float32', default: 5.0, label: 'Position X' },
    posY: { type: 'Float32', default: 10.0, label: 'Position Y' },
    posZ: { type: 'Float32', default: 5.0, label: 'Position Z' },
  },
  generate(config, className) {
    return `// @v43-template: directional-light
import { System } from '@v43/core'
import { DirectionalLight, Color } from 'three'

export default class ${className} extends System({
  config: {
    color: { type: 'String', default: '${config.color}' },
    intensity: { type: 'Float32', default: ${config.intensity} },
    posX: { type: 'Float32', default: ${config.posX} },
    posY: { type: 'Float32', default: ${config.posY} },
    posZ: { type: 'Float32', default: ${config.posZ} },
  },
}) {
  private scene = this.load('Scene')

  constructor() {
    super()
    const light = new DirectionalLight(new Color(this.config.color.value), this.config.intensity.value)
    light.position.set(this.config.posX.value, this.config.posY.value, this.config.posZ.value)

    this.effect(() => {
      const scene = this.scene.value
      if (!scene) return
      scene.add(light)
      return () => scene.remove(light)
    })
  }
}
`
  },
}

export const pointLightTemplate: SystemTemplate = {
  name: 'Point Light',
  marker: 'point-light',
  category: 'light',
  filePrefix: 'light',
  configFields: {
    color: { type: 'String', default: '#ffffff', label: 'Color' },
    intensity: { type: 'Float32', default: 1.0, label: 'Intensity' },
    distance: { type: 'Float32', default: 0.0, label: 'Distance' },
    posX: { type: 'Float32', default: 0.0, label: 'Position X' },
    posY: { type: 'Float32', default: 5.0, label: 'Position Y' },
    posZ: { type: 'Float32', default: 0.0, label: 'Position Z' },
  },
  generate(config, className) {
    return `// @v43-template: point-light
import { System } from '@v43/core'
import { PointLight, Color } from 'three'

export default class ${className} extends System({
  config: {
    color: { type: 'String', default: '${config.color}' },
    intensity: { type: 'Float32', default: ${config.intensity} },
    distance: { type: 'Float32', default: ${config.distance} },
    posX: { type: 'Float32', default: ${config.posX} },
    posY: { type: 'Float32', default: ${config.posY} },
    posZ: { type: 'Float32', default: ${config.posZ} },
  },
}) {
  private scene = this.load('Scene')

  constructor() {
    super()
    const light = new PointLight(new Color(this.config.color.value), this.config.intensity.value, this.config.distance.value)
    light.position.set(this.config.posX.value, this.config.posY.value, this.config.posZ.value)

    this.effect(() => {
      const scene = this.scene.value
      if (!scene) return
      scene.add(light)
      return () => scene.remove(light)
    })
  }
}
`
  },
}

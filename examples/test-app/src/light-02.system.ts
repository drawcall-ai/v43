// @v43-template: ambient-light
import { System } from '@v43/core'
import { AmbientLight, Color } from 'three'

export default class Light02System extends System({
  config: {
    color: { type: 'String', default: '#ffffff' },
    intensity: { type: 'Float32', default: 0.19999999999999996 },
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

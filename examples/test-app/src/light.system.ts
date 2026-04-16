// @v43-template: point-light
import { System } from '@v43/core'
import { PointLight, Color } from 'three'

export default class LightSystem extends System({
  config: {
    color: { type: 'String', default: '#ffffff' },
    intensity: { type: 'Float32', default: 30.1 },
    distance: { type: 'Float32', default: 0 },
    posX: { type: 'Float32', default: 0 },
    posY: { type: 'Float32', default: 5 },
    posZ: { type: 'Float32', default: 0 },
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

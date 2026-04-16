/**
 * Tests: @v43/cli-handler command registration, CLI → server → browser flow
 */
import { System } from '@v43/core'
import { cli } from '@v43/cli-handler'
import { Color, Vector2 } from 'three'

export default class CliSystem extends System() {
  private scene = this.load('Scene')
  private renderer = this.load('Renderer')

  constructor() {
    super()

    cli.command('status', 'Get scene status').action(async () => ({
      childCount: this.scene.value!.children.length,
      type: this.scene.value!.type,
    }))

    cli.command('scene-info', 'Get detailed scene info').action(async () => ({
      children: this.scene.value!.children.map((c) => ({
        type: c.type,
        name: c.name || '(unnamed)',
        position: { x: c.position.x, y: c.position.y, z: c.position.z },
      })),
    }))

    cli.command('set-bg <color>', 'Set background color hex').action(async (color: string) => {
      this.scene.value!.background = new Color(parseInt(color, 16))
      return { background: color }
    })

    cli.command('screenshot-info', 'Get renderer info').action(async () => {
      const size = this.renderer.value!.getSize(new Vector2())
      return { width: size.x, height: size.y, pixelRatio: this.renderer.value!.getPixelRatio() }
    })

    console.log('[cli] Commands registered: status, scene-info, set-bg, screenshot-info')
  }
}

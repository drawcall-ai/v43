/**
 * Tests: resource() async helper, this.provide(), this.effect() with cleanup,
 *        declare global Resources augmentation
 */
import { System, resource } from '@v43/core'
import { SphereGeometry, Mesh, MeshNormalMaterial } from 'three'

declare global {
  interface Resources {
    TestSphere: Mesh
  }
}

export default class AssetSystem extends System() {
  private scene = this.load('Scene')

  private sphere = resource(async () => {
    await new Promise((r) => setTimeout(r, 1000))
    const mesh = new Mesh(new SphereGeometry(0.5, 32, 32), new MeshNormalMaterial())
    mesh.position.x = 2
    console.log('[assets] Sphere loaded after 1s delay')
    return mesh
  })

  constructor() {
    super()
    console.log('[assets] Starting async sphere load...')
    this.provide('TestSphere', this.sphere)

    this.effect(() => {
      const mesh = this.sphere.value
      if (!mesh) return
      this.scene.value!.add(mesh)
      console.log('[assets] Sphere added to scene')
      return () => {
        this.scene.value!.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as MeshNormalMaterial).dispose()
        console.log('[assets] Sphere removed and disposed')
      }
    })
  }
}

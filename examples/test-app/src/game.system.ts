import { System } from '@v43/core'
import { computed } from '@preact/signals-core'
import { createComponent } from 'elics'
import { Mesh, BoxGeometry, MeshStandardMaterial, Color } from 'three'

const Position = createComponent('Position', {
  x: { type: 'Float32', default: 0 },
  y: { type: 'Float32', default: 0 },
  z: { type: 'Float32', default: 0 },
})

const Velocity = createComponent('Velocity', {
  vx: { type: 'Float32', default: 0 },
  vy: { type: 'Float32', default: 0 },
  vz: { type: 'Float32', default: 0 },
})

export default class GameSystem extends System({
  queries: {
    moving: { required: [Position, Velocity] },
  },
}) {
  private sphere = this.load('TestSphere')
  private meshes = new Map<number, Mesh>()
  private spawned = false

  isReady() {
    return computed(() => this.sphere.value !== null)
  }

  update(delta: number) {
    // Spawn entities on first update (world is available by now)
    if (!this.spawned) {
      this.spawned = true
      const scene = this.load('Scene').value
      if (scene) {
        for (let i = 0; i < 5; i++) {
          const entity = this.createEntity()
          entity.addComponent(Position, {
            x: (Math.random() - 0.5) * 6,
            y: (Math.random() - 0.5) * 6,
            z: (Math.random() - 0.5) * 6,
          })
          entity.addComponent(Velocity, {
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            vz: (Math.random() - 0.5) * 2,
          })

          const mesh = new Mesh(
            new BoxGeometry(0.3, 0.3, 0.3),
            new MeshStandardMaterial({ color: new Color().setHSL(Math.random(), 0.7, 0.5) }),
          )
          scene.add(mesh)
          this.meshes.set(entity.index, mesh)
        }
      }
    }

    // Rotate the test sphere
    this.sphere.value!.rotation.z += delta * 2

    // Move entities based on velocity, bounce off bounds
    for (const entity of this.queries.moving.entities) {
      const px = entity.getValue(Position, 'x')!
      const py = entity.getValue(Position, 'y')!
      const pz = entity.getValue(Position, 'z')!
      let vx = entity.getValue(Velocity, 'vx')!
      let vy = entity.getValue(Velocity, 'vy')!
      let vz = entity.getValue(Velocity, 'vz')!

      let nx = px + vx * delta
      let ny = py + vy * delta
      let nz = pz + vz * delta

      // Bounce off bounds
      if (Math.abs(nx) > 4) {
        vx = -vx
        nx = px + vx * delta
      }
      if (Math.abs(ny) > 4) {
        vy = -vy
        ny = py + vy * delta
      }
      if (Math.abs(nz) > 4) {
        vz = -vz
        nz = pz + vz * delta
      }

      entity.setValue(Position, 'x', nx)
      entity.setValue(Position, 'y', ny)
      entity.setValue(Position, 'z', nz)
      entity.setValue(Velocity, 'vx', vx)
      entity.setValue(Velocity, 'vy', vy)
      entity.setValue(Velocity, 'vz', vz)

      // Sync mesh
      const mesh = this.meshes.get(entity.index)
      if (mesh) {
        mesh.position.set(nx, ny, nz)
      }
    }
  }
}

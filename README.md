# V43

Vite-powered Three.js framework. Write `*.system.ts` files and get a live 3D app with hot module replacement, an ECS runtime, server-side RPC, a CLI bridge, an in-browser editor, and drag-and-drop asset import.

## Getting Started

```bash
mkdir my-app && cd my-app
npm init -y
npm install @v43/core @v43/plugin three elics @preact/signals-core
npm install -D vite typescript
```

Create a Vite config that loads the V43 plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { v43 } from '@v43/plugin'

export default defineConfig({
  plugins: v43(),
})
```

That's it — no `index.html`, no canvas setup, no render loop. V43 generates all of that for you. Now create your first system.

## Systems

V43 auto-discovers every file matching `*.system.ts` in your project. Each system is a class with a default export that extends `System()`.

### Your First System

```ts
// src/light.system.ts
import { System } from '@v43/core'
import { AmbientLight } from 'three'

export default class LightSystem extends System() {
  private scene = this.load('Scene')

  constructor() {
    super()
    const light = new AmbientLight(0xffffff, 1)

    this.effect(() => {
      const scene = this.scene.value
      if (!scene) return
      scene.add(light)
      return () => scene.remove(light)
    })
  }
}
```

Run `npx vite` and open the browser. The light system is live. Edit it — V43 hot-swaps the system without reloading the page. Create another `*.system.ts` file — it gets picked up instantly.

### Resources

V43 provides core Three.js objects as reactive signals. Load them with `this.load()`:

```ts
private scene = this.load('Scene')       // Signal<Scene | null>
private camera = this.load('Camera')     // Signal<PerspectiveCamera | null>
private renderer = this.load('Renderer') // Signal<WebGLRenderer | null>
private canvas = this.load('Canvas')     // Signal<HTMLCanvasElement | null>
```

Signals start as `null` and are populated during initialization. Use `this.effect()` to react when they become available.

### Effects

`this.effect()` creates a reactive scope — it re-runs whenever any signal it reads changes. Return a cleanup function to tear down on re-run or system removal:

```ts
constructor() {
  super()
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())

  this.effect(() => {
    const scene = this.scene.value
    if (!scene) return
    scene.add(mesh)
    return () => scene.remove(mesh) // cleanup
  })
}
```

### Update Loop

Override `update()` to run code every frame:

```ts
export default class SpinSystem extends System() {
  private scene = this.load('Scene')

  update(delta: number, time: number) {
    for (const child of this.scene.value?.children ?? []) {
      child.rotation.y += delta
    }
  }
}
```

### Config Schema

Define a config schema to get reactive config signals. These values appear in the editor and can be live-edited:

```ts
export default class BoxSystem extends System({
  config: {
    color: { type: 'String', default: '#ff0000' },
    size: { type: 'Float32', default: 1.0 },
    geometry: { type: 'Enum', default: 'box', enum: { Box: 'box', Sphere: 'sphere' } },
  },
}) {
  constructor() {
    super()
    console.log(this.config.color.value) // '#ff0000'
    console.log(this.config.size.value) // 1.0
    console.log(this.config.geometry.value) // 'box'
  }
}
```

Supported field types: `Float32`, `Int32`, `String`, `Uint8` (boolean), `Enum`.

## Loading Assets

Use the `resource()` helper for anything asynchronous. It returns a signal that starts as `null` and resolves when the promise completes:

```ts
import { System, resource } from '@v43/core'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import modelUrl from './robot.glb?url'

export default class RobotSystem extends System() {
  private scene = this.load('Scene')
  private model = resource(() => new GLTFLoader().loadAsync(modelUrl))

  constructor() {
    super()
    this.effect(() => {
      const gltf = this.model.value
      const scene = this.scene.value
      if (!gltf || !scene) return
      scene.add(gltf.scene)
      return () => scene.remove(gltf.scene)
    })
  }
}
```

### Startup Gate

V43 hides the canvas behind a splash screen until all systems are ready. By default, systems report ready immediately. Override `isReady()` to gate on an async resource:

```ts
import { computed } from '@preact/signals-core'

export default class ModelSystem extends System() {
  private model = resource(() => loadModel())

  isReady() {
    return computed(() => this.model.value !== null)
  }
}
```

The canvas appears and the splash screen is removed once every non-async system reports ready. Place a `splash.html` file in your project root to customize the loading screen.

## Sharing Resources Between Systems

Use `this.provide()` to make a value available to other systems, and `this.load()` to consume it:

```ts
// assets.system.ts — provides a resource
declare global {
  interface Resources {
    PlayerModel: GLTF
  }
}

export default class AssetSystem extends System() {
  private model = resource(() => new GLTFLoader().loadAsync('/player.glb'))

  constructor() {
    super()
    this.provide('PlayerModel', this.model)
  }
}
```

```ts
// spawn.system.ts — consumes the resource
export default class SpawnSystem extends System() {
  private model = this.load('PlayerModel')

  constructor() {
    super()
    this.effect(() => {
      const gltf = this.model.value
      if (!gltf) return
      // model is loaded and available
    })
  }
}
```

Augmenting the global `Resources` interface gives you type-safe `this.load()` and `this.provide()` calls.

## ECS (Entity Component System)

V43 uses [elics](https://github.com/elics-ecs/elics) for entity-component-system support. Define components with typed schemas, then query for entities that match:

```ts
import { System } from '@v43/core'
import { createComponent } from 'elics'

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

export default class PhysicsSystem extends System({
  queries: {
    moving: { required: [Position, Velocity] },
  },
}) {
  constructor() {
    super()
    // Spawn some entities
    for (let i = 0; i < 100; i++) {
      const e = this.createEntity()
      e.addComponent(Position, { x: Math.random() * 10 })
      e.addComponent(Velocity, { vx: Math.random() })
    }
  }

  update(delta: number) {
    for (const entity of this.queries.moving.entities) {
      const x = entity.getValue(Position, 'x')!
      const vx = entity.getValue(Velocity, 'vx')!
      entity.setValue(Position, 'x', x + vx * delta)
    }
  }
}
```

## Server RPC

Mark any function with `"use server"` and it executes on the Vite dev server while remaining callable from browser code — no API routes, no fetch calls:

```ts
// src/files.system.ts
import { System } from '@v43/core'

function listFiles(dir: string) {
  'use server'
  const fs = await import('node:fs')
  return fs.readdirSync(dir)
}

export default class FileSystem extends System() {
  constructor() {
    super()
    listFiles(process.cwd()).then((files) => {
      console.log('Project files:', files)
    })
  }
}
```

The RPC plugin rewrites `"use server"` functions into WebSocket stubs at transform time. The original function body runs on the server; the browser gets a thin async wrapper.

## Editor

Append `?editor` to the dev server URL or click the **Editor** button in the bottom toolbar. The editor provides:

- **Config panel** — live-edit config values for any system with a config schema (changes write back to the `.system.ts` file)
- **System templates** — add new lights or meshes from the toolbar dropdown
- **Scene graph** — inspect position, rotation, scale, and visibility of every Object3D
- **Query inspector** — view ECS entities and their component data
- **Delete** — remove system files from the editor panel
- **Editor camera** — orbit around the scene independently of the game camera

## CLI Bridge

Register commands in the browser that can be invoked from any external tool (shell scripts, Node.js processes, AI agents):

```ts
// src/tools.system.ts
import { System } from '@v43/core'
import { cli } from '@v43/cli-handler'

export default class ToolsSystem extends System() {
  private scene = this.load('Scene')

  constructor() {
    super()
    cli.command('scene-info', 'Get scene details').action(async () => ({
      children: this.scene.value!.children.length,
    }))

    cli.command('set-bg <color>', 'Set background color').action(async (color: string) => {
      this.scene.value!.background = new Color(parseInt(color, 16))
    })
  }
}
```

Send commands from Node.js:

```ts
import { cliSend } from '@v43/cli-client'

const info = await cliSend('scene-info')
await cliSend('set-bg ff0000')
```

Commands are sent via HTTP POST to the Vite dev server, which forwards them to the browser over WebSocket.

## Drag and Drop

Drop `.gltf` or `.glb` files into the browser window during development. V43 automatically:

1. Copies the model file into `src/<model-name>/`
2. Generates a `spawn.system.ts` that loads and displays the model
3. Adds position config fields and a delete handler
4. The new system appears immediately via HMR

## Packages

| Package              | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| `@v43/core`          | Runtime — System base class, resource signals, ECS integration                   |
| `@v43/plugin`        | Combined Vite plugin — includes all sub-plugins                                  |
| `@v43/plugin-three`  | System discovery, HTML generation, HMR                                           |
| `@v43/plugin-ws`     | WebSocket connection management                                                  |
| `@v43/plugin-rpc`    | `"use server"` RPC transform                                                     |
| `@v43/plugin-cli`    | CLI HTTP endpoint + browser bridge                                               |
| `@v43/plugin-editor` | In-browser editor overlay                                                        |
| `@v43/plugin-drop`   | Drag-and-drop GLTF import                                                        |
| `@v43/cli-handler`   | Browser-side CLI command registration (uses [cac](https://github.com/cacjs/cac)) |
| `@v43/cli-client`    | Node.js client for sending CLI commands                                          |
| `@v43/rpc-types`     | TypeScript types for RPC                                                         |

## Development

```bash
pnpm install
pnpm build
pnpm typecheck

# Run the example app
cd examples/test-app
pnpm dev
```

## License

MIT

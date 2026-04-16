import {
  createSystem,
  type System as ElicsSystem,
  type SystemConstructor as ElicsSystemConstructor,
  type SystemQueries,
  type SystemSchema,
} from 'elics'
import { signal, effect as rawEffect, type Signal, type ReadonlySignal } from '@preact/signals-core'
import type { Scene, PerspectiveCamera, WebGLRenderer } from 'three'

// --- Global Resources interface (users augment via declare global) ---

declare global {
  interface Resources {
    Scene: Scene
    Camera: PerspectiveCamera
    Renderer: WebGLRenderer
    Canvas: HTMLCanvasElement
  }
}

// Module-level singletons — the entry module imports and populates these
export const resourceStore = new Map<string, Signal<unknown>>()
export const resourceOwners = new Map<string, object>()

// --- System entry type (used by editor, entry module, etc.) ---

export interface SystemEntry {
  path: string
  SystemClass: SystemBaseConstructor<SystemSchema, SystemQueries> & {
    schema?: Record<string, { type?: string; enum?: Record<string, string> }>
    __v43_delete?: () => Promise<void>
  }
}

// World and systems refs — set by the entry module, read by the editor
export let world: import('elics').World | null = null
export let systems: SystemEntry[] = []
export function __setWorld(w: import('elics').World) {
  world = w
}
export function __setSystems(s: SystemEntry[]) {
  systems = s
}

// Editor camera and active flag — set by the entry module, used by the editor plugin
export let editorCamera: PerspectiveCamera | null = null
export const editorActive = signal(false)
export function __setEditorCamera(cam: PerspectiveCamera) {
  editorCamera = cam
}

// Editor per-frame callback — called from the render loop, set by the editor plugin
export let __editorFrameCallback: (() => void) | null = null
export function __setEditorFrameCallback(cb: (() => void) | null) {
  __editorFrameCallback = cb
}

// --- Type-safe load check ---

type CheckResource<K extends keyof Resources, T> = Resources[K] extends T
  ? Signal<Resources[K] | null>
  : { readonly __error: `Resource '${K & string}' does not satisfy expected type` }

// --- resource() helper ---

export function resource<T>(factory: () => Promise<T>): Signal<T | null> {
  const s = signal<T | null>(null)
  factory().then((v) => {
    s.value = v
  })
  return s
}

// --- System instance interface ---

export interface SystemInstance<
  S extends SystemSchema,
  Q extends SystemQueries,
> extends ElicsSystem<S, Q> {
  load<T = unknown, K extends keyof Resources = keyof Resources>(key: K): CheckResource<K, T>

  provide<K extends keyof Resources>(
    key: K,
    value: Signal<Resources[K] | null> | Resources[K],
  ): void

  effect(fn: () => void | (() => void)): void

  isReady(): ReadonlySignal<boolean> | boolean
}

// --- System constructor type ---

export interface SystemBaseConstructor<S extends SystemSchema, Q extends SystemQueries> {
  // The constructor accepts zero args from user code (super()),
  // and the 3-arg form is used internally by elics world.registerSystem()
  new (...args: [] | ConstructorParameters<ElicsSystemConstructor<S, Q>>): SystemInstance<S, Q>
  schema: S
  isSystem: boolean
  queries: Q
}

// --- System config ---

interface SystemConfig<Q extends SystemQueries, S extends SystemSchema> {
  queries?: Q
  config?: S
  delete?: () => Promise<void>
}

// --- System() factory ---

export function System<Q extends SystemQueries = {}, S extends SystemSchema = {}>(
  config?: SystemConfig<Q, S>,
): SystemBaseConstructor<S, Q> {
  const queries: Q = config?.queries ?? ({} as Q)
  const schema: S = config?.config ?? ({} as S)

  const Base = createSystem(queries, schema)

  // We must use `as any` for the dynamic extends — TypeScript cannot verify
  // dynamic base classes. The return type annotation ensures proper typing
  // for consumers.
  class SystemBase extends (Base as { new (...args: any[]): ElicsSystem<S, Q> }) {
    private __effectDisposers: (() => void)[] = []

    override createEntity() {
      // elics sets this.world in its constructor, but V43 user code calls
      // super() with no args so this.world may be undefined.
      // Fall back to the module-level world reference.
      if (this.world) return this.world.createEntity()
      if (world) return world.createEntity()
      throw new Error('[v43] Cannot create entity: world not initialized')
    }

    effect(fn: () => void | (() => void)): void {
      const dispose = rawEffect(fn)
      this.__effectDisposers.push(dispose)
    }

    load<T = unknown, K extends keyof Resources = keyof Resources>(key: K): CheckResource<K, T> {
      const store = resourceStore
      const k = key as string
      if (!store.has(k)) {
        store.set(k, signal(null))
      }
      return store.get(k) as CheckResource<K, T>
    }

    provide<K extends keyof Resources>(
      key: K,
      value: Signal<Resources[K] | null> | Resources[K],
    ): void {
      const store = resourceStore
      const owners = resourceOwners
      const k = key as string

      const existingOwner = owners.get(k)
      if (existingOwner && existingOwner !== this) {
        throw new Error(
          `[v43] Resource '${k}' is already provided by another active system. ` +
            `Only one system can provide a resource at a time.`,
        )
      }

      owners.set(k, this)

      const isSignal = (v: unknown): v is Signal<unknown> =>
        v !== null && typeof v === 'object' && 'value' in v && 'subscribe' in v

      if (isSignal(value)) {
        store.set(k, value)
      } else {
        const existing = store.get(k)
        if (existing) {
          existing.value = value
        } else {
          store.set(k, signal(value))
        }
      }
    }

    isReady(): ReadonlySignal<boolean> | boolean {
      return true
    }

    override update(_delta: number, _time: number): void {}

    override destroy(): void {
      for (const dispose of this.__effectDisposers) {
        dispose()
      }
      this.__effectDisposers.length = 0

      const owners = resourceOwners
      const store = resourceStore
      for (const [k, owner] of owners.entries()) {
        if (owner === this) {
          const s = store.get(k)
          if (s) s.value = null
          owners.delete(k)
        }
      }
    }
  }

  if (config?.delete) {
    Object.defineProperty(SystemBase, '__v43_delete', { value: config.delete, configurable: true })
  }

  return SystemBase as unknown as SystemBaseConstructor<S, Q>
}

// --- Shared string utilities ---

export function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

export function toKebabCase(filename: string): string {
  const name = filename
    .replace(/\.(gltf|glb)$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return name || 'model'
}

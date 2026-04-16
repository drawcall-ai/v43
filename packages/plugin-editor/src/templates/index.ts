import type { ViteDevServer } from 'vite'

export const EDITOR_KEY = Symbol.for('v43:editor')

export interface ConfigFieldDef {
  type: string
  default: string | number | boolean
  label?: string
  enum?: Record<string, string>
}

export interface SystemTemplate {
  /** Display name in the toolbar dropdown (e.g., "Ambient Light") */
  name: string
  /** Marker written as `// @v43-template: {marker}` in generated files */
  marker: string
  /** Grouping category for toolbar (e.g., "light", "mesh") */
  category: string
  /** File prefix for naming (e.g., "light" -> light.system.ts, light-02.system.ts) */
  filePrefix: string
  /** Config fields with types and defaults — drives both code generation and tweakpane inputs */
  configFields: Record<string, ConfigFieldDef>
  /** Generate the full .system.ts source from config values and a class name */
  generate: (config: Record<string, string | number | boolean>, className: string) => string
}

export interface EditorApi {
  registerTemplate(template: SystemTemplate): void
  getTemplates(): SystemTemplate[]
}

const editorApiStore = new WeakMap<ViteDevServer, EditorApi>()

/** Read the EditorApi stored on a ViteDevServer by the editor plugin */
export function getEditorApi(server: ViteDevServer): EditorApi | undefined {
  return editorApiStore.get(server)
}

/** Store the EditorApi on a ViteDevServer */
export function setEditorApi(server: ViteDevServer, api: EditorApi): void {
  editorApiStore.set(server, api)
}

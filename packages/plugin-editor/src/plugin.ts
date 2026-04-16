import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { toPascalCase } from '@v43/core'
import { getWsApi } from '@v43/plugin-ws'
import type { SystemTemplate, EditorApi } from './templates/index.ts'
import { setEditorApi } from './templates/index.ts'
import {
  ambientLightTemplate,
  directionalLightTemplate,
  pointLightTemplate,
} from './templates/light.ts'
import { meshTemplate } from './templates/mesh.ts'

const VIRTUAL_PATH = '/@v43/editor-client'
const CLIENT_FILE = new URL('./client.ts', import.meta.url).pathname

function findNextFilename(srcDir: string, prefix: string): { filename: string; className: string } {
  const base = `${prefix}.system.ts`
  if (!fs.existsSync(path.join(srcDir, base))) {
    return { filename: base, className: toPascalCase(prefix) + 'System' }
  }
  for (let i = 2; i < 100; i++) {
    const nn = String(i).padStart(2, '0')
    const name = `${prefix}-${nn}.system.ts`
    if (!fs.existsSync(path.join(srcDir, name))) {
      return { filename: name, className: toPascalCase(`${prefix}-${nn}`) + 'System' }
    }
  }
  throw new Error(`Too many ${prefix} systems`)
}

function readTemplateMarker(filePath: string): string | null {
  try {
    const first = fs.readFileSync(filePath, 'utf-8').split('\n', 1)[0]
    const match = first.match(/^\/\/ @v43-template: (.+)$/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function getDefaults(template: SystemTemplate): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {}
  for (const [key, field] of Object.entries(template.configFields)) {
    defaults[key] = field.default
  }
  return defaults
}

export function pluginEditor(): Plugin {
  // Two indexes: by name (for toolbar) and by marker (for config updates)
  const templatesByName = new Map<string, SystemTemplate>()
  const templatesByMarker = new Map<string, SystemTemplate>()
  let projectRoot = ''

  function registerTemplate(template: SystemTemplate) {
    templatesByName.set(template.name, template)
    templatesByMarker.set(template.marker, template)
  }

  const editorApi: EditorApi = {
    registerTemplate,
    getTemplates() {
      return Array.from(templatesByName.values())
    },
  }

  // Register built-in templates
  for (const t of [
    ambientLightTemplate,
    directionalLightTemplate,
    pointLightTemplate,
    meshTemplate,
  ]) {
    registerTemplate(t)
  }

  return {
    name: 'v43:editor',
    apply: 'serve',

    resolveId(id) {
      if (id === VIRTUAL_PATH) return CLIENT_FILE
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: VIRTUAL_PATH },
          injectTo: 'head-prepend',
        },
      ]
    },

    configureServer(server) {
      projectRoot = server.config.root
      setEditorApi(server, editorApi)

      const wsApi = getWsApi(server)
      if (!wsApi) {
        throw new Error('@v43/plugin-editor requires @v43/plugin-ws to be registered first')
      }

      // Send available templates to client on request
      wsApi.onClientMessage('v43:editor:get-templates', (_data, client) => {
        client.send('v43:editor:templates', {
          templates: editorApi.getTemplates().map((t) => ({
            name: t.name,
            category: t.category,
            configFields: t.configFields,
          })),
        })
      })

      // Add a new system from template
      wsApi.onClientMessage<{ templateName: string }>('v43:editor:add', (data) => {
        const template = templatesByName.get(data.templateName)
        if (!template) return

        const srcDir = path.join(projectRoot, 'src')
        if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true })

        const { filename, className } = findNextFilename(srcDir, template.filePrefix)
        fs.writeFileSync(
          path.join(srcDir, filename),
          template.generate(getDefaults(template), className),
        )
      })

      // Update config of an existing template-generated system
      wsApi.onClientMessage<{
        filePath: string
        config: Record<string, string | number | boolean>
      }>('v43:editor:update-config', (data) => {
        const absolutePath = path.join(projectRoot, data.filePath)
        const marker = readTemplateMarker(absolutePath)
        if (!marker) return

        const template = templatesByMarker.get(marker)
        if (!template) return

        const basename = path.basename(absolutePath, '.system.ts')
        const className = toPascalCase(basename) + 'System'
        fs.writeFileSync(absolutePath, template.generate(data.config, className))
      })

      // Default delete — just delete the file. Custom delete is handled
      // browser-side via System({ delete: fn }) which calls the RPC stub directly.
      wsApi.onClientMessage<{ filePath: string }>('v43:editor:delete', (data) => {
        const absolutePath = path.join(projectRoot, data.filePath)
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
      })
    },
  }
}

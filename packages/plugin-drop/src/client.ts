import { generateSpawnSystem, toKebabCase, toPascalCase } from './template.ts'

const ALLOWED_EXTENSIONS = ['.gltf', '.glb']

async function saveDroppedModel(filename: string, base64Data: string) {
  'use server'
  const fs = await import('node:fs')
  const path = await import('node:path')

  const ext = path.extname(filename).toLowerCase()
  const kebab = toKebabCase(filename)
  const className = toPascalCase(kebab) + 'SpawnSystem'
  const normalizedFilename = kebab + ext

  const folderPath = path.join(process.cwd(), 'src', kebab)
  fs.mkdirSync(folderPath, { recursive: true })

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(path.join(folderPath, normalizedFilename), buffer)

  const systemCode = generateSpawnSystem(className, normalizedFilename, folderPath)
  fs.writeFileSync(path.join(folderPath, 'spawn.system.ts'), systemCode)

  return { folder: kebab, system: kebab + '/spawn.system.ts' }
}

document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

document.addEventListener('drop', async (e) => {
  e.preventDefault()
  if (!e.dataTransfer) return
  const files = Array.from(e.dataTransfer.files)
  const gltfFiles = files.filter((f) =>
    ALLOWED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
  )

  for (const file of gltfFiles) {
    console.log('[drop] Uploading', file.name, '...')
    const buffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
    )

    try {
      const result = await saveDroppedModel(file.name, base64)
      console.log('[drop] Created', result.system)
    } catch (err) {
      console.error('[drop] Error:', err)
    }
  }
})

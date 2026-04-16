import path from 'node:path'

/**
 * Build the virtual `/@v43/system-list` module that exports discovered systems.
 *
 * In build mode: static imports so Rollup can bundle system files.
 * In dev mode: dynamic imports to support HMR add/remove without full reload.
 */
export function buildSystemListModule(
  systemPaths: string[],
  projectRoot: string,
  isBuild: boolean,
): string {
  const systems = systemPaths.map((filePath, i) => ({
    relativePath: '/' + path.relative(projectRoot, filePath).replace(/\\/g, '/'),
    varName: `__v43_System${i}`,
  }))

  if (isBuild) {
    const imports = systems
      .map((s) => `import ${s.varName} from ${JSON.stringify(s.relativePath)}`)
      .join('\n')
    const entries = systems
      .map((s) => `  { path: ${JSON.stringify(s.relativePath)}, SystemClass: ${s.varName} }`)
      .join(',\n')
    return `${imports}\nexport const systemEntries = [\n${entries}\n]\n`
  }

  const pathsJson = systems.map((s) => JSON.stringify(s.relativePath)).join(', ')
  return `export const systemEntries = []
const paths = [${pathsJson}]
for (const p of paths) {
  const mod = await import(/* @vite-ignore */ p)
  if (mod.default) {
    systemEntries.push({ path: p, SystemClass: mod.default })
  }
}
`
}

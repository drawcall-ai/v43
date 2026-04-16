import cac from 'cac'

export const cli = cac('v43')
cli.help()

/**
 * Split a command string into argv tokens.
 * Handles basic quoting (single and double quotes).
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (const ch of input) {
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }

  if (current) tokens.push(current)
  return tokens
}

/**
 * Parse a raw command string and execute the matching action.
 * Called internally by the @v43/cli plugin's injected client code.
 * Returns the result of the action handler.
 */
export async function parseAndExecute(input: string): Promise<unknown> {
  const tokens = tokenize(input)
  if (tokens.length === 0) throw new Error('No command provided')

  // cac expects argv-style array: [node, script, ...args]
  const { args, options } = cli.parse(['', '', ...tokens], { run: false })

  if (!cli.matchedCommand?.commandAction) throw new Error(`Unknown command: ${tokens[0]}`)

  return cli.matchedCommand.commandAction.apply(null, [...args, options])
}

#!/usr/bin/env tsx

import { Command } from 'commander'
import { cliSend } from '@v43/cli-client'

const program = new Command()

program
  .name('v43-test')
  .description('Send commands to a running V43 dev server')
  .option('-p, --port <port>', 'dev server port', '5173')

program
  .command('send')
  .description('Send a raw command string to the browser')
  .argument('<input...>', 'command and arguments')
  .action(async (input: string[]) => {
    const port = parseInt(program.opts().port, 10)
    const result = await cliSend(input.join(' '), { port })
    console.log(JSON.stringify(result, null, 2))
  })

program
  .command('status')
  .description('Get scene status')
  .action(async () => {
    const port = parseInt(program.opts().port, 10)
    const result = await cliSend('status', { port })
    console.log(JSON.stringify(result, null, 2))
  })

program
  .command('scene-info')
  .description('Get detailed scene info')
  .action(async () => {
    const port = parseInt(program.opts().port, 10)
    const result = await cliSend('scene-info', { port })
    console.log(JSON.stringify(result, null, 2))
  })

program
  .command('set-bg')
  .description('Set scene background color')
  .argument('<color>', 'hex color (e.g. ff0000)')
  .action(async (color: string) => {
    const port = parseInt(program.opts().port, 10)
    const result = await cliSend(`set-bg ${color}`, { port })
    console.log(JSON.stringify(result, null, 2))
  })

program.parse()

#!/usr/bin/env node

import { Command } from 'commander'
import { sendCommand } from './commands/send.js'
import { statusCommand } from './commands/status.js'
import { configCommand } from './commands/config.js'
import { serveCommand } from './commands/serve.js'

const program = new Command()

program
  .name('notify-hub')
  .description('NotifyHub - Self-hosted notification push service')
  .version('0.1.0')

program.addCommand(sendCommand)
program.addCommand(statusCommand)
program.addCommand(configCommand)
program.addCommand(serveCommand)

program.parse()

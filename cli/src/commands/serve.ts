import { Command } from 'commander'
import chalk from 'chalk'
import { execSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'

export const serveCommand = new Command('serve')
  .description('Start the NotifyHub server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', '0.0.0.0')
  .action((opts) => {
    console.log(chalk.bold('Starting NotifyHub server...'))

    // Find the server entry point
    const serverPath = resolve(
      import.meta.dirname,
      '../../node_modules/@notify-hub/server/dist/index.js'
    )

    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: opts.port,
        HOST: opts.host,
      },
      stdio: 'inherit',
    })

    child.on('error', (err) => {
      console.error(chalk.red(`Failed to start server: ${err.message}`))
      process.exit(1)
    })

    child.on('exit', (code) => {
      process.exit(code || 0)
    })
  })

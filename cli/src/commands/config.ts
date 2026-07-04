import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, saveConfig, type CliConfig } from '../lib/config.js'

export const configCommand = new Command('config')
  .description('Manage CLI configuration')

configCommand
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Config key (server, token, format)')
  .argument('<value>', 'Config value')
  .action((key, value) => {
    const validKeys: (keyof CliConfig)[] = ['server', 'token', 'format']
    if (!validKeys.includes(key as keyof CliConfig)) {
      console.error(chalk.red(`Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`))
      process.exit(1)
    }

    const config = loadConfig()
    ;(config as any)[key] = value
    saveConfig(config)

    console.log(chalk.green(`✓ Set ${key} = ${key === 'token' ? '***' : value}`))
  })

configCommand
  .command('get')
  .description('Get a configuration value')
  .argument('[key]', 'Config key (omit to show all)')
  .action((key?) => {
    const config = loadConfig()

    if (key) {
      const value = (config as any)[key]
      if (value === undefined) {
        console.log(chalk.gray(`${key}: (not set)`))
      } else {
        console.log(`${key}: ${key === 'token' ? '***' : value}`)
      }
    } else {
      console.log(chalk.bold('Current configuration:'))
      console.log(chalk.gray('─'.repeat(40)))
      for (const [k, v] of Object.entries(config)) {
        if (v !== undefined) {
          console.log(`  ${k}: ${k === 'token' ? '***' : v}`)
        }
      }
    }
  })

configCommand
  .command('init')
  .description('Interactive configuration setup')
  .action(async () => {
    const { createInterface } = await import('node:readline')
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(q, resolve))

    console.log(chalk.bold('NotifyHub CLI Configuration'))
    console.log(chalk.gray('─'.repeat(40)))

    const server = await ask('Server URL [http://localhost:3000]: ')
    const token = await ask('API Token: ')

    rl.close()

    const config = loadConfig()
    if (server) config.server = server
    if (token) config.token = token
    saveConfig(config)

    console.log(chalk.green('\n✓ Configuration saved to ~/.notifyhub.yaml'))
  })

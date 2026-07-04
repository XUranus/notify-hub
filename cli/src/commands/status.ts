import { Command } from 'commander'
import chalk from 'chalk'
import { NotifyClient } from '../lib/client.js'

export const statusCommand = new Command('status')
  .description('Check the status of a message')
  .argument('<id>', 'Message ID')
  .option('--server <url>', 'Server URL override')
  .option('--token <token>', 'API token override')
  .action(async (id, opts) => {
    const client = new NotifyClient(opts.server, opts.token)
    const result = await client.getMessage(id)

    if (!result.success) {
      console.error(chalk.red(`✗ Error: ${result.error}`))
      process.exit(1)
    }

    const msg = result.data
    console.log()
    console.log(chalk.bold('Message Details'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(`  ID:         ${msg.id}`)
    console.log(`  Channel:    ${msg.channelType}`)
    console.log(`  To:         ${msg.toAddress}`)
    console.log(`  Subject:    ${msg.subject || '(none)'}`)
    console.log(`  Status:     ${formatStatus(msg.status)}`)
    console.log(`  Retries:    ${msg.retryCount}/${msg.maxRetries}`)
    if (msg.errorMessage) {
      console.log(`  Error:      ${chalk.red(msg.errorMessage)}`)
    }
    if (msg.sentAt) {
      console.log(`  Sent At:    ${new Date(msg.sentAt).toLocaleString()}`)
    }
    console.log(`  Created:    ${new Date(msg.createdAt).toLocaleString()}`)
    console.log()
  })

function formatStatus(status: string): string {
  switch (status) {
    case 'queued': return chalk.yellow(status)
    case 'sending': return chalk.blue(status)
    case 'sent': return chalk.green(status)
    case 'delivered': return chalk.greenBright(status)
    case 'failed': return chalk.red(status)
    case 'dead': return chalk.bgRed.white(status)
    default: return status
  }
}

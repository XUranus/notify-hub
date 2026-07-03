import { Command } from 'commander'
import chalk from 'chalk'
import { NotifyClient } from '../lib/client.js'

export const sendCommand = new Command('send')
  .description('Send a notification message')
  .requiredOption('-c, --channel <type>', 'Channel type (email, sms, push)')
  .requiredOption('-t, --to <address>', 'Recipient address')
  .option('-s, --subject <subject>', 'Message subject (for email)')
  .option('-b, --body <body>', 'Message body')
  .option('--template <name>', 'Template name to use')
  .option('--var <key=value...>', 'Template variables (repeatable)', collectVars, {})
  .option('--idempotency-key <key>', 'Idempotency key to prevent duplicates')
  .option('--tags <tags...>', 'Tags (space-separated)')
  .option('--priority <n>', 'Priority 0-99 (higher = more urgent)', parseInt)
  .option('--url <url>', 'URL for click-through in push notification')
  .option('--delay <delay>', 'Delay: relative (30m, 1h, 1d, 1w) or absolute (yyyy-mm-dd hh:mm:ss)')
  .option('--attachment-name <name>', 'Attachment filename')
  .option('--attachment-url <url>', 'Attachment download URL')
  .option('--attachment-data <base64>', 'Attachment base64 data')
  .option('--format <format>', 'Body format: text, markdown, html, json', 'text')
  .option('--server <url>', 'Server URL override')
  .option('--token <token>', 'API token override')
  .action(async (opts) => {
    if (!opts.body && !opts.template) {
      console.error(chalk.red('Error: --body or --template is required'))
      process.exit(1)
    }

    if (opts.attachmentName && !opts.attachmentUrl && !opts.attachmentData) {
      console.error(chalk.red('Error: --attachment-name requires --attachment-url or --attachment-data'))
      process.exit(1)
    }

    const client = new NotifyClient(opts.server, opts.token)

    console.log(chalk.gray(`Sending ${opts.channel} notification to ${opts.to}...`))

    const result = await client.send({
      channel: opts.channel,
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      template: opts.template,
      variables: opts.var,
      idempotencyKey: opts.idempotencyKey,
      tags: opts.tags,
      priority: opts.priority,
      url: opts.url,
      delay: opts.delay,
      attachment: opts.attachmentName ? {
        name: opts.attachmentName,
        url: opts.attachmentUrl,
        data: opts.attachmentData,
      } : undefined,
      format: opts.format,
    })

    if (result.success) {
      console.log(chalk.green('✓ Message queued successfully'))
      console.log(chalk.gray(`  Message ID: ${result.data?.messageId}`))
      console.log(chalk.gray(`  Status:     ${result.data?.status}`))
    } else {
      console.error(chalk.red(`✗ Failed: ${result.error}`))
      process.exit(1)
    }
  })

function collectVars(value: string, prev: Record<string, string>) {
  const eqIdx = value.indexOf('=')
  if (eqIdx === -1) {
    console.error(chalk.red(`Invalid variable format: ${value} (expected key=value)`))
    process.exit(1)
  }
  const key = value.slice(0, eqIdx)
  const val = value.slice(eqIdx + 1)
  return { ...prev, [key]: val }
}

import { serve } from '@hono/node-server'
import { bootstrap } from './app.js'
import { getConfig } from './config.js'

async function main() {
  const config = getConfig()
  const app = await bootstrap()

  serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    },
    (info) => {
      console.log(`
╔═══════════════════════════════════════════╗
║          NotifyHub v0.1.0                 ║
║───────────────────────────────────────────║
║  Server:  http://${info.address}:${info.port}          ║
║  Mode:    ${config.nodeEnv.padEnd(28)}║
║  API:     http://${info.address}:${info.port}/api       ║
║  Health:  http://${info.address}:${info.port}/health     ║
╚═══════════════════════════════════════════╝
`)
    }
  )
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

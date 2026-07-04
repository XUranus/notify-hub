import { fetchBatch, processMessage } from './manager.js'
import { WORKER_POLL_INTERVAL_MS } from '@notify-hub/shared'
import { cleanupOldMessages } from './cleanup.js'

let running = false
let timer: ReturnType<typeof setTimeout> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the background worker that polls for messages to process.
 */
export function startWorker() {
  if (running) return
  running = true
  console.log('[worker] Starting message worker...')
  poll()

  // Run cleanup every hour
  cleanupTimer = setInterval(async () => {
    try {
      const deleted = await cleanupOldMessages()
      if (deleted > 0) {
        console.log(`[worker] Cleaned up ${deleted} old message(s)`)
      }
    } catch (err) {
      console.error('[worker] Cleanup error:', err)
    }
  }, 3600_000) // 1 hour
  cleanupTimer.unref()
}

/**
 * Stop the worker gracefully.
 */
export function stopWorker() {
  running = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  console.log('[worker] Worker stopped.')
}

const MAX_CONCURRENT = 3 // Max concurrent message sends

async function poll() {
  if (!running) return

  try {
    const messages = await fetchBatch()

    if (messages.length > 0) {
      console.log(`[worker] Processing ${messages.length} message(s)...`)

      // Process messages with bounded concurrency (MAX_CONCURRENT at a time)
      let failed = 0
      for (let i = 0; i < messages.length; i += MAX_CONCURRENT) {
        if (!running) break
        const batch = messages.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map(async (msg) => {
            if (!running) return
            await processMessage(msg)
          })
        )
        failed += results.filter(r => r.status === 'rejected').length
      }

      if (failed > 0) {
        console.warn(`[worker] ${failed}/${messages.length} message(s) failed to process`)
      }
    }
  } catch (err) {
    console.error('[worker] Poll error:', err)
  }

  // Schedule next poll
  if (running) {
    timer = setTimeout(poll, WORKER_POLL_INTERVAL_MS)
  }
}

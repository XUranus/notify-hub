package com.notifyhub.client

object Constants {
    // ── Default Server Configuration ──
    const val DEFAULT_SERVER_URL = "http://localhost:9527"
    const val DEFAULT_DOCKER_BACKEND_PORT = 9527

    // ── Timeout Constants (seconds) ──
    const val CONNECT_TIMEOUT_SECS = 10L
    const val READ_TIMEOUT_SECS = 30L
    const val WRITE_TIMEOUT_SECS = 30L
    const val SSE_TIMEOUT_SECS = 300L
    const val WS_CONNECT_TIMEOUT_SECS = 10L
    const val WS_PING_INTERVAL_SECS = 30L

    // ── Polling Intervals (milliseconds) ──
    const val POLL_INTERVAL_MS = 3000L
    const val STATUS_CHECK_INTERVAL_MS = 3000L
    const val NEW_MESSAGE_CHECK_INTERVAL_MS = 1500L
    const val REFRESH_INTERVAL_MS = 30000L

    // ── UI Timeouts (milliseconds) ──
    const val TOAST_TIMEOUT_MS = 3000L
    const val UNDO_TIMEOUT_MS = 5000L
    const val COPY_TIMEOUT_MS = 2000L
    const val ANIMATION_TIMEOUT_MS = 500L
}

package com.notifyhub.client.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.compose.runtime.mutableStateOf
import androidx.core.app.NotificationCompat
import com.notifyhub.client.MainActivity
import com.notifyhub.client.R
import com.notifyhub.client.data.ApiClient
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.PollException
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.LocalMessage
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.AppDatabase
import com.notifyhub.client.data.PushMessage
import com.notifyhub.client.data.SseClient
import com.notifyhub.client.data.WsClient
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import kotlin.coroutines.coroutineContext
import java.io.File
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PollService : Service() {

    companion object {
        private const val TAG = "PollService"
        private const val CHANNEL_ID_SERVICE = "notifyhub_service"
        private const val CHANNEL_ID_PUSH = "notifyhub_push"
        private const val NOTIFICATION_ID_SERVICE = 1001
        private const val POLL_INTERVAL_MS = 5000L

        const val ACTION_START = "com.notifyhub.client.START_POLL"
        const val ACTION_STOP = "com.notifyhub.client.STOP_POLL"
    }

    // Binder for Activity binding
    inner class LocalBinder : Binder() {
        fun getService(): PollService = this@PollService
    }

    private val binder = LocalBinder()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollJob: Job? = null

    // Observable Compose state for UI (thread-safe for Compose observation)
    val isConnected = mutableStateOf(false)
    val lastPollTime = mutableStateOf<String?>(null)
    val lastError = mutableStateOf<String?>(null)
    val isOfflineMode = mutableStateOf(false)
    val showOfflineDialog = mutableStateOf(false)
    val actualConnectionMode = mutableStateOf("poll") // tracks the real active mode
    private var wasConnected = false
    private var reconnectJob: Job? = null

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        AppLogger.d(TAG, "onStartCommand action=${intent?.action}")
        when (intent?.action) {
            ACTION_STOP -> {
                stopPolling()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID_SERVICE, buildServiceNotification())
                AppLogger.d(TAG, "startForeground done, starting polling")
                startPolling()
            }
        }
        // Always return START_STICKY so the system restarts us if killed,
        // unless the master keep-alive switch is off
        return if (ConfigStore.isKeepAliveEnabled(this)) START_STICKY else START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        AppLogger.i(TAG, "onTaskRemoved called")
        if (ConfigStore.isKeepAliveEnabled(this) && ConfigStore.isKeepAliveTaskRemovedEnabled(this)) {
            AppLogger.i(TAG, "Restarting service after task removed")
            val intent = Intent(this, PollService::class.java).apply { action = ACTION_START }
            try { startForegroundService(intent) } catch (e: Exception) { AppLogger.e(TAG, "Failed to restart on task removed", e) }
        }
    }

    override fun onDestroy() {
        AppLogger.i(TAG, "PollService destroyed")
        stopPolling()
        scope.cancel()
        super.onDestroy()
    }

    fun restart() {
        AppLogger.i(TAG, "PollService restart()")
        stopPolling()
        startPolling()
    }

    private var sseClient: SseClient? = null
    private var wsClient: WsClient? = null
    private var modeJob: Job? = null  // Tracks the active connection mode coroutine
    private var currentApi: ApiClient? = null  // For ack'ing messages
    private var currentUuid: String? = null

    private fun startPolling() {
        if (pollJob?.isActive == true) return

        pollJob = scope.launch {
            var config = ConfigStore.load(this@PollService)
            val mode = ConfigStore.getConnectionMode(this@PollService)
            AppLogger.d(TAG, "Connection started: mode=$mode, serverUrl=${config.serverUrl}, uuid=${config.clientUuid}")

            // Login if JWT is empty
            var jwt = config.jwtToken
            if (jwt.isBlank()) {
                if (config.username.isBlank()) {
                    AppLogger.w(TAG, "No JWT and no username configured, skipping")
                    isConnected.value = false
                    lastError.value = I18n["notif_conn_failed"]
                    return@launch
                }
                AppLogger.d(TAG, "No JWT, attempting login...")
                val loginPair = loginAndCreateApi(config.serverUrl, config.username, config.password)
                if (loginPair == null) return@launch
                jwt = loginPair.second
            }

            var api = ApiClient(config.serverUrl, jwt)

            // Fetch FCM token (if Firebase is configured, with 5s timeout)
            var fcmToken: String? = null
            try {
                // Delete old token first to force refresh (fixes stale tokens from old Firebase projects)
                val fcm = com.google.firebase.messaging.FirebaseMessaging.getInstance()
                withTimeoutOrNull(3000L) { fcm.deleteToken().await() }
                AppLogger.i(TAG, "Old FCM token deleted, fetching new one...")

                fcmToken = withTimeoutOrNull(5000L) {
                    fcm.token.await()
                }
                if (fcmToken != null) {
                    AppLogger.i(TAG, "FCM token obtained: ${fcmToken!!.take(20)}...")
                } else {
                    AppLogger.w(TAG, "FCM token fetch timed out")
                }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Could not get FCM token (Firebase may not be configured): ${e.message}")
            }

            // Initial registration with retry
            AppLogger.d(TAG, "Attempting register...")
            var registered = false
            for (attempt in 1..3) {
                registered = api.register(config.clientUuid, config.clientName, fcmToken)
                AppLogger.d(TAG, "Register attempt $attempt result: $registered")
                if (registered) break
                if (attempt < 3) delay(2000)
            }
            if (registered) {
                isConnected.value = true
                lastError.value = null
            }

            startMode(mode, config, jwt, api)
        }
    }

    /** Start a specific connection mode. Stops any previous mode first. */
    private fun startMode(mode: String, config: ClientConfig, jwt: String, api: ApiClient) {
        // Stop previous mode and cancel any pending reconnect
        reconnectJob?.cancel()
        reconnectJob = null
        modeJob?.cancel()
        modeJob = null
        sseClient?.stop()
        sseClient = null
        wsClient?.stop()
        wsClient = null

        // Store for ack'ing messages received via SSE/WS
        currentApi = api
        currentUuid = config.clientUuid

        actualConnectionMode.value = mode
        AppLogger.d(TAG, "Starting mode: $mode")
        when (mode) {
            "sse" -> startSseMode(config, jwt, api)
            "ws" -> startWsMode(config, jwt, api)
            else -> {
                modeJob = scope.launch { startPollMode(config, jwt, api) }
            }
        }
    }

    /**
     * Try switching to a new connection mode.
     * Returns true if switch succeeded (connection established within timeout), false otherwise.
     * On failure, reverts to the previous mode.
     */
    suspend fun trySwitchMode(newMode: String): Boolean {
        val oldMode = ConfigStore.getConnectionMode(this@PollService)
        if (newMode == oldMode) return true

        // Save new mode and restart
        ConfigStore.setConnectionMode(this@PollService, newMode)
        restart()

        // Wait up to 8 seconds for connection
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < 8000) {
            delay(500)
            if (isConnected.value && actualConnectionMode.value == newMode) {
                return true
            }
        }

        // Connection failed — revert to old mode
        AppLogger.w(TAG, "Mode switch to $newMode failed, reverting to $oldMode")
        ConfigStore.setConnectionMode(this@PollService, oldMode)
        restart()
        return false
    }

    private suspend fun handleIncomingMessages(messages: List<PushMessage>, source: String) {
        val now = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        lastPollTime.value = now

        if (messages.isNotEmpty()) {
            AppLogger.d(TAG, "Received ${messages.size} message(s) via $source")
            val newMessages = MessageStore.save(this@PollService, messages)
            AppLogger.d(TAG, "${messages.size} received, ${newMessages.size} new, ${messages.size - newMessages.size} duplicates")

            // Ack all messages on server (including duplicates) so they won't be re-delivered
            val api = currentApi
            val uuid = currentUuid
            if (api != null && uuid != null) {
                val ids = messages.mapNotNull { it.id }
                if (ids.isNotEmpty()) {
                    scope.launch(Dispatchers.IO) {
                        try { api.ack(uuid, ids) } catch (e: Exception) { AppLogger.e(TAG, "Ack failed for ${ids.size} messages", e) }
                    }
                }
            }

            // Only process new (non-duplicate) messages
            if (newMessages.isNotEmpty()) {
                if (ConfigStore.getAutoDownloadImages(this@PollService)) {
                    for (msg in newMessages) {
                        tryAutoDownloadImage(msg)
                    }
                }

                if (!ConfigStore.isMuted(this@PollService)) {
                    for (msg in newMessages) {
                        showPushNotification(msg)
                    }
                }
            }
        }
    }

    private fun handleConnectionRestored() {
        if (!isConnected.value) {
            AppLogger.i(TAG, "Connection restored")
            if (wasConnected) {
                showStatusNotification(
                    I18n["notif_connected"] ?: "Connected",
                    I18n["notif_connected_body"] ?: "Connection restored"
                )
            }
            isConnected.value = true
            lastError.value = null
        }
        if (isOfflineMode.value || showOfflineDialog.value) {
            isOfflineMode.value = false
            showOfflineDialog.value = false
        }
        wasConnected = true
    }

    private fun startSseMode(config: ClientConfig, jwt: String, api: ApiClient) {
        sseClient = SseClient(
            serverUrl = config.serverUrl,
            jwtToken = jwt,
            uuid = config.clientUuid,
            onMessage = { messages ->
                scope.launch { handleIncomingMessages(messages, "SSE") }
            },
            onConnected = {
                actualConnectionMode.value = "sse"
                scope.launch { handleConnectionRestored() }
            },
            onError = { e ->
                AppLogger.e(TAG, "SSE error: ${e.message}")
                // Only reconnect if still in SSE mode and no pending reconnect
                if (ConfigStore.getConnectionMode(this@PollService) == "sse" && reconnectJob?.isActive != true) {
                    reconnectJob = scope.launch {
                        sseClient?.stop()
                        sseClient = null
                        delay(POLL_INTERVAL_MS)
                        if (isActive) startSseMode(config, jwt, api)
                    }
                }
            },
            onClosed = {
                AppLogger.w(TAG, "SSE closed")
                // Only reconnect if still in SSE mode and no pending reconnect
                if (ConfigStore.getConnectionMode(this@PollService) == "sse" && reconnectJob?.isActive != true) {
                    reconnectJob = scope.launch {
                        sseClient?.stop()
                        sseClient = null
                        delay(POLL_INTERVAL_MS)
                        if (isActive) startSseMode(config, jwt, api)
                    }
                }
            },
            onAuthError = {
                AppLogger.w(TAG, "SSE auth error (401), re-logging in...")
                scope.launch {
                    sseClient?.stop()
                    sseClient = null
                    if (config.username.isNotBlank()) {
                        val reloginPair = loginAndCreateApi(config.serverUrl, config.username, config.password)
                        if (reloginPair != null) {
                            val (newApi, newJwt) = reloginPair
                            newApi.register(config.clientUuid, config.clientName)
                            if (ConfigStore.getConnectionMode(this@PollService) == "sse") {
                                startSseMode(config, newJwt, newApi)
                            }
                        }
                    }
                }
            }
        )
        sseClient?.start()
    }

    private fun startWsMode(config: ClientConfig, jwt: String, api: ApiClient) {
        wsClient = WsClient(
            serverUrl = config.serverUrl,
            jwtToken = jwt,
            uuid = config.clientUuid,
            onMessage = { messages ->
                scope.launch { handleIncomingMessages(messages, "WebSocket") }
            },
            onConnected = {
                actualConnectionMode.value = "ws"
                scope.launch { handleConnectionRestored() }
            },
            onError = { e ->
                AppLogger.e(TAG, "WS error: ${e.message}")
                if (ConfigStore.getConnectionMode(this@PollService) == "ws" && reconnectJob?.isActive != true) {
                    reconnectJob = scope.launch {
                        wsClient?.stop()
                        wsClient = null
                        delay(POLL_INTERVAL_MS)
                        if (isActive) startWsMode(config, jwt, api)
                    }
                }
            },
            onClosed = {
                AppLogger.w(TAG, "WS closed")
                if (ConfigStore.getConnectionMode(this@PollService) == "ws" && reconnectJob?.isActive != true) {
                    reconnectJob = scope.launch {
                        wsClient?.stop()
                        wsClient = null
                        delay(POLL_INTERVAL_MS)
                        if (isActive) startWsMode(config, jwt, api)
                    }
                }
            },
            onAuthError = {
                AppLogger.w(TAG, "WS auth error (401), re-logging in...")
                scope.launch {
                    wsClient?.stop()
                    wsClient = null
                    if (config.username.isNotBlank()) {
                        val reloginPair = loginAndCreateApi(config.serverUrl, config.username, config.password)
                        if (reloginPair != null) {
                            val (newApi, newJwt) = reloginPair
                            newApi.register(config.clientUuid, config.clientName)
                            if (ConfigStore.getConnectionMode(this@PollService) == "ws") {
                                startWsMode(config, newJwt, newApi)
                            }
                        }
                    }
                }
            }
        )
        wsClient?.start()
    }

    private suspend fun startPollMode(config: ClientConfig, jwt: String, api: ApiClient) {
        AppLogger.d(TAG, "Poll loop started")
        var currentApi = api
        var currentJwt = jwt

        while (coroutineContext.isActive) {
            try {
                val (code, messages) = currentApi.pollRawResponse(config.clientUuid)
                handleIncomingMessages(messages, "Poll")
                handleConnectionRestored()
            } catch (e: PollException) {
                if (e.code == 401 && config.username.isNotBlank()) {
                    AppLogger.w(TAG, "JWT expired (401), re-logging in...")
                    val reloginPair = loginAndCreateApi(config.serverUrl, config.username, config.password)
                    if (reloginPair != null) {
                        currentApi = reloginPair.first
                        currentJwt = reloginPair.second
                        AppLogger.d(TAG, "Re-login successful")
                        currentApi.register(config.clientUuid, config.clientName)
                        continue
                    }
                }
                AppLogger.e(TAG, "Poll HTTP error: ${e.code}", e)
                handlePollError(e)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Poll error", e)
                handlePollError(e)
            }

            delay(POLL_INTERVAL_MS)
        }
        AppLogger.d(TAG, "Poll loop ended")
    }

    private fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
        modeJob?.cancel()
        modeJob = null
        sseClient?.stop()
        sseClient = null
        wsClient?.stop()
        wsClient = null
        isConnected.value = false
    }

    /** Enter offline mode - keep polling silently without showing login prompts */
    fun enterOfflineMode() {
        AppLogger.i(TAG, "Entered offline mode")
        isOfflineMode.value = true
        showOfflineDialog.value = false
    }

    /** Switch account - clear offline mode and go to config screen */
    fun switchAccount() {
        AppLogger.i(TAG, "Switching account")
        isOfflineMode.value = false
        showOfflineDialog.value = false
        wasConnected = false
        stopPolling()
    }

    private fun handlePollError(e: Exception) {
        if (isOfflineMode.value) {
            wasConnected = false
        } else {
            isConnected.value = false
            lastError.value = e.message ?: I18n["notif_poll_failed"]
            if (wasConnected) {
                // Was connected, now lost - send disconnect notification
                showStatusNotification(I18n["notif_disconnected"] ?: "Disconnected", I18n["notif_disconnected_body"] ?: "Connection lost")
            }
            // Show offline dialog for any connection failure
            showOfflineDialog.value = true
            wasConnected = false
        }
    }

    /**
     * Attempt login, save JWT, return (ApiClient, jwt) or null on failure.
     * Sets isConnected/lastError on failure.
     */
    private suspend fun loginAndCreateApi(
        serverUrl: String, username: String, password: String
    ): Pair<ApiClient, String>? {
        val result = ApiClient.login(serverUrl, username, password)
        if (result.isFailure) {
            AppLogger.e(TAG, "Login failed", result.exceptionOrNull())
            isConnected.value = false
            lastError.value = result.exceptionOrNull()?.message ?: I18n["notif_conn_failed"]
            return null
        }
        val newJwt = result.getOrThrow()
        ConfigStore.saveJwtToken(this@PollService, newJwt)
        AppLogger.d(TAG, "Login successful, JWT saved")
        return Pair(ApiClient(serverUrl, newJwt), newJwt)
    }

    private fun showPushNotification(msg: PushMessage) {
        AppLogger.i(TAG, "Showing notification: id=${msg.id} title=${msg.title}")
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val isHighPriority = msg.level.lowercase() in listOf("error", "critical", "warning", "warn")

        // Click intent — opens MainActivity and passes message ID for read marking
        val contentIntent = PendingIntent.getActivity(
            this, msg.id.hashCode(),
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("open_message_id", msg.id)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val largeIcon = decodeTopicIcon(msg.topicIcon)
            ?: BitmapFactory.decodeResource(resources, R.drawable.logo)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_PUSH)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(msg.title)
            .setContentText(msg.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(msg.body))
            .setLargeIcon(largeIcon)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL) // sound + vibrate + lights
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)

        // Wake screen for error/critical
        if (msg.level.lowercase() in listOf("error", "critical")) {
            val fullScreenIntent = PendingIntent.getActivity(
                this, msg.id.hashCode() + 10000,
                Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            builder.setFullScreenIntent(fullScreenIntent, true)
        }

        nm.notify(msg.id.hashCode(), builder.build())
    }

    private fun decodeTopicIcon(icon: String?): Bitmap? {
        if (icon.isNullOrEmpty()) return null
        return try {
            val bytes = if (icon.startsWith("data:")) {
                Base64.decode(icon.substringAfter(","), Base64.DEFAULT)
            } else {
                Base64.decode(icon, Base64.DEFAULT)
            }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (e: Exception) {
            AppLogger.w(TAG, "Failed to decode topic icon: ${e.message}")
            null
        }
    }

    private fun showStatusNotification(title: String, body: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val contentIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_PUSH)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)

        nm.notify("status".hashCode(), builder.build())
    }

    private fun buildServiceNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val text = I18n["notif_running"]
        return NotificationCompat.Builder(this, CHANNEL_ID_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(I18n["notif_title"])
            .setContentText(text)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Service channel (low priority, silent)
            val serviceChannel = NotificationChannel(
                CHANNEL_ID_SERVICE,
                I18n["notif_channel_name"],
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = I18n["notif_channel_desc"]
                setShowBadge(false)
            }
            nm.createNotificationChannel(serviceChannel)

            // Push messages channel (high priority — sound, heads-up, vibrate)
            val pushChannel = NotificationChannel(
                CHANNEL_ID_PUSH,
                I18n["tab_messages"],
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = I18n["notif_title"]
                enableVibration(true)
                enableLights(true)
                setShowBadge(true)
            }
            nm.createNotificationChannel(pushChannel)
        }
    }

    private fun PushMessage.toLocal() = LocalMessage(
        id = id,
        title = title,
        body = body,
        level = level,
        receivedAt = createdAt?.let { MessageStore.normalizeTimeFormat(it) } ?: SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
        tags = tags,
        priority = priority,
        url = url,
        attachment = attachment,
        format = format ?: "text"
    )

    private val MAX_AUTO_DOWNLOAD_SIZE = 5 * 1024 * 1024L // 5MB

    private fun tryAutoDownloadImage(msg: PushMessage) {
        if (msg.attachment == null) return
        try {
            val att: Map<*, *> = Gson().fromJson(msg.attachment, Map::class.java)
            val url = att["url"]?.toString() ?: return
            val name = att["name"]?.toString() ?: "image"
            val size = (att["size"] as? Number)?.toLong() ?: 0

            // Only download images
            val isImage = name.lowercase().let {
                it.endsWith(".png") || it.endsWith(".jpg") || it.endsWith(".jpeg") ||
                it.endsWith(".gif") || it.endsWith(".webp") || it.endsWith(".svg") || it.endsWith(".bmp")
            }
            if (!isImage) return

            // Size check
            if (size > MAX_AUTO_DOWNLOAD_SIZE) return

            // Build full URL
            val serverUrl = ConfigStore.load(this).serverUrl.trimEnd('/')
            val fullUrl = if (url.startsWith("http")) url else "$serverUrl$url"

            // Download
            val bytes = URL(fullUrl).readBytes()
            if (bytes.size > MAX_AUTO_DOWNLOAD_SIZE) return

            // Save to internal storage
            val imagesDir = File(filesDir, "notifyhub_images")
            imagesDir.mkdirs()
            val ext = name.substringAfterLast('.', "jpg")
            val safeName = url.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(64)
            val file = File(imagesDir, "$safeName.$ext")
            file.writeBytes(bytes)
            AppLogger.d(TAG, "Auto-downloaded image: $name -> ${file.absolutePath}")

            // Update message entity with local path (tied to service lifecycle)
            scope.launch {
                try {
                    val dao = AppDatabase.getInstance(this@PollService).messageDao()
                    dao.setLocalImagePath(msg.id, file.absolutePath)
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to update local image path", e)
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Auto-download image failed", e)
        }
    }
}

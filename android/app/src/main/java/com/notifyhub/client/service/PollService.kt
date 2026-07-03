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
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.LocalMessage
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.PushMessage
import kotlinx.coroutines.*
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
        return START_STICKY
    }

    override fun onDestroy() {
        stopPolling()
        scope.cancel()
        super.onDestroy()
    }

    fun restart() {
        pollJob?.cancel()
        startPolling()
    }

    private fun startPolling() {
        if (pollJob?.isActive == true) return

        pollJob = scope.launch {
            val config = ConfigStore.load(this@PollService)
            AppLogger.d(TAG, "Polling started: serverUrl=${config.serverUrl}, apiKey=${config.apiKey.take(8)}..., uuid=${config.clientUuid}")
            if (config.apiKey.isBlank()) {
                AppLogger.w(TAG, "No API key configured, skipping polling")
                return@launch
            }

            val api = ApiClient(config.serverUrl, config.apiKey)

            // Initial registration
            AppLogger.d(TAG, "Attempting register...")
            val registered = api.register(config.clientUuid, config.clientName)
            AppLogger.d(TAG, "Register result: $registered")
            isConnected.value = registered
            lastError.value = if (registered) null else I18n["notif_conn_failed"]

            // Poll loop
            while (isActive) {
                try {
                    val messages = api.poll(config.clientUuid)
                    val now = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                    lastPollTime.value = now

                    if (messages.isNotEmpty()) {
                        MessageStore.save(this@PollService, messages)

                        if (!ConfigStore.isMuted(this@PollService)) {
                            for (msg in messages) {
                                showPushNotification(msg)
                            }
                        }
                    }

                    if (!isConnected.value) {
                        isConnected.value = true
                        lastError.value = null
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Poll error", e)
                    isConnected.value = false
                    lastError.value = e.message ?: I18n["notif_poll_failed"]
                }

                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
        isConnected.value = false
    }

    private fun showPushNotification(msg: PushMessage) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val isHighPriority = msg.level.lowercase() in listOf("error", "critical", "warning", "warn")

        // Click intent — opens MainActivity and passes message ID for read marking
        val contentIntent = PendingIntent.getActivity(
            this, msg.id.hashCode(),
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("read_message_id", msg.id)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_PUSH)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(msg.title)
            .setContentText(msg.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(msg.body))
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
        receivedAt = createdAt ?: SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
        tags = tags,
        priority = priority,
        url = url,
        attachment = attachment,
        format = format ?: "text"
    )
}

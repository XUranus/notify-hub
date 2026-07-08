package com.notifyhub.client.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.notifyhub.client.MainActivity
import com.notifyhub.client.R
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.ApiClient
import com.notifyhub.client.data.PushMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Firebase Cloud Messaging service.
 * Receives FCM data messages and displays local notifications directly.
 * This is the primary push delivery channel — the app also relies on
 * SSE/WS/Poll for reliable message delivery and acknowledgment.
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"
        private const val CHANNEL_ID_PUSH = "notifyhub_push"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Called when a new FCM registration token is generated.
     * Uploads the token to the server so it can send push notifications.
     */
    override fun onNewToken(token: String) {
        AppLogger.d(TAG, "FCM token refreshed: ${token.take(16)}...")
        scope.launch {
            uploadFcmToken(token)
        }
    }

    /**
     * Called when an FCM data message is received.
     * Displays a local notification directly from the data payload.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        AppLogger.d(TAG, "FCM message received from: ${message.from}")

        if (!ConfigStore.isFcmEnabled(this)) {
            AppLogger.i(TAG, "FCM disabled in settings, ignoring message")
            return
        }

        val data = message.data
        if (data.isEmpty()) {
            AppLogger.w(TAG, "FCM message has no data payload")
            return
        }

        AppLogger.d(TAG, "FCM data keys: ${data.keys}")

        val msgId = data["id"] ?: return
        val title = data["title"] ?: "NotifyHub"
        val body = data["body"] ?: ""
        val level = data["level"] ?: "info"
        val tags = data["tags"]
        val url = data["url"]
        val attachment = data["attachment"]
        val format = data["format"] ?: "text"
        val topicId = data["topicId"]
        val topicName = data["topicName"]
        val topicDisplayName = data["topicDisplayName"]
        val topicIcon = data["topicIcon"]

        // Save to local database and always ACK to prevent server retries
        scope.launch {
            try {
                val config = ConfigStore.load(this@MyFirebaseMessagingService)
                val pushMsg = PushMessage(
                    id = msgId,
                    clientUuid = config.clientUuid,
                    title = title,
                    body = body,
                    level = level,
                    delivered = true,
                    tags = tags,
                    url = url,
                    attachment = attachment,
                    format = format,
                    topicId = topicId,
                    topicName = topicName,
                    topicDisplayName = topicDisplayName,
                    topicIcon = topicIcon,
                    createdAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(Date())
                )
                val newMessages = MessageStore.save(this@MyFirebaseMessagingService, listOf(pushMsg))
                AppLogger.d(TAG, "FCM message saved: $msgId (${newMessages.size} new)")

                // Always ack to prevent server from retrying FCM delivery (L3 fix)
                if (config.jwtToken.isNotBlank() && config.serverUrl.isNotBlank()) {
                    val api = ApiClient(config.serverUrl, config.jwtToken)
                    try {
                        api.ack(config.clientUuid, listOf(msgId))
                    } catch (e: Exception) {
                        AppLogger.e(TAG, "FCM ack failed", e)
                    }
                }

                // M3: Delegate to PollService's debounce pipeline if running,
                // otherwise show notification directly as fallback
                if (PollService.isRunning) {
                    AppLogger.d(TAG, "PollService is running, enqueuing message into debounce pipeline")
                    PollService.enqueueMessages(listOf(pushMsg))
                } else {
                    AppLogger.d(TAG, "PollService not running, showing notification directly")
                    showNotification(msgId, title, body, level, topicIcon)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to save FCM message", e)
            }
        }
    }

    private fun showNotification(
        msgId: String,
        title: String,
        body: String,
        level: String,
        topicIcon: String?
    ) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val contentIntent = PendingIntent.getActivity(
            this, msgId.hashCode(),
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("open_message_id", msgId)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val largeIcon = decodeTopicIcon(topicIcon)
            ?: BitmapFactory.decodeResource(resources, R.drawable.logo)

        val isHighPriority = level.lowercase() in listOf("error", "critical", "warning", "warn")

        val displayBody = truncateForNotification(body)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID_PUSH)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(displayBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setLargeIcon(largeIcon)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(if (isHighPriority) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setDefaults(Notification.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)

        if (level.lowercase() in listOf("error", "critical")) {
            val fullScreenIntent = PendingIntent.getActivity(
                this, msgId.hashCode() + 10000,
                Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            builder.setFullScreenIntent(fullScreenIntent, true)
        }

        nm.notify(msgId.hashCode(), builder.build())
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

    private fun uploadFcmToken(token: String) {
        try {
            val config = ConfigStore.load(this)
            if (config.jwtToken.isBlank() || config.serverUrl.isBlank()) {
                AppLogger.w(TAG, "Cannot upload FCM token: not configured")
                return
            }

            val api = ApiClient(config.serverUrl, config.jwtToken)
            val success = api.register(config.clientUuid, config.clientName, fcmToken = token)
            if (success) {
                AppLogger.d(TAG, "FCM token uploaded successfully")
            } else {
                AppLogger.w(TAG, "Failed to upload FCM token")
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error uploading FCM token", e)
        }
    }
}

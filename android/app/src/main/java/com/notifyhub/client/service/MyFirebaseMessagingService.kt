package com.notifyhub.client.service

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.PushMessage
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Firebase Cloud Messaging service.
 * Receives FCM messages when the app is in the background or foreground.
 * FCM acts as a supplementary wake-up channel — the app still relies on
 * SSE/WS/Poll for reliable message delivery and acknowledgment.
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"
    }

    private val scope = CoroutineScope(Dispatchers.IO)

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
     * Called when an FCM message is received.
     * FCM data messages trigger a poll to fetch the full message from the server.
     * FCM notification messages are displayed by the system automatically.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        AppLogger.d(TAG, "FCM message received from: ${message.from}")

        // If it's a data-only message, we need to poll for the actual message
        if (message.data.isNotEmpty()) {
            val data = message.data
            AppLogger.d(TAG, "FCM data: ${data.keys}")

            // Trigger a poll to fetch the message from the server
            // This ensures reliable delivery even if FCM data is incomplete
            scope.launch {
                triggerPoll()
            }
        }

        // If it has a notification payload, the system displays it automatically
        // We don't need to handle it here
    }

    /**
     * Upload the FCM token to the server via the existing register endpoint.
     */
    private fun uploadFcmToken(token: String) {
        try {
            val config = ConfigStore.load(this)
            if (config.jwtToken.isBlank() || config.serverUrl.isBlank()) {
                AppLogger.w(TAG, "Cannot upload FCM token: not configured")
                return
            }

            val api = ApiClient(config.serverUrl, config.jwtToken)
            // Re-register with the new FCM token
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

    /**
     * Trigger a poll to fetch any pending messages.
     * This acts as a wake-up mechanism when FCM data messages arrive.
     */
    private suspend fun triggerPoll() {
        try {
            val config = ConfigStore.load(this)
            if (config.jwtToken.isBlank() || config.serverUrl.isBlank()) {
                AppLogger.w(TAG, "Cannot trigger poll: not configured")
                return
            }

            val api = ApiClient(config.serverUrl, config.jwtToken)
            val messages = api.poll(config.clientUuid)
            if (messages.isNotEmpty()) {
                AppLogger.d(TAG, "FCM-triggered poll found ${messages.size} message(s)")
                val newMessages = MessageStore.save(this, messages)
                AppLogger.d(TAG, "${messages.size} received, ${newMessages.size} new, ${messages.size - newMessages.size} duplicates")

                // Ack messages on server
                val ids = messages.mapNotNull { it.id }
                if (ids.isNotEmpty()) {
                    try { api.ack(config.clientUuid, ids) } catch (e: Exception) { AppLogger.e(TAG, "FCM ack failed", e) }
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "FCM-triggered poll failed", e)
        }
    }
}

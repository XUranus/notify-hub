package com.notifyhub.client.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/**
 * SSE client for real-time push notification delivery.
 * Connects to /api/user/push/stream and receives messages as they arrive.
 */
class SseClient(
    private val serverUrl: String,
    private val jwtToken: String,
    private val uuid: String,
    private val onMessage: (List<PushMessage>) -> Unit,
    private val onConnected: () -> Unit,
    private val onError: (Exception) -> Unit,
    private val onClosed: () -> Unit,
    private val onAuthError: (() -> Unit)? = null,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS) // SSE: 90s heartbeat timeout — triggers reconnect if no data arrives
        .build()

    private val gson = Gson()
    private var eventSource: EventSource? = null

    fun start() {
        AppLogger.i(TAG, "Starting SSE connection")
        val url = "${serverUrl.trimEnd('/')}/api/user/push/stream?uuid=$uuid"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $jwtToken")
            .build()

        val listener = object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) {
                AppLogger.d(TAG, "SSE connected")
                onConnected()
            }

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                if (type == "connected") {
                    AppLogger.d(TAG, "SSE handshake confirmed")
                    return
                }
                if (data.isBlank()) { AppLogger.d(TAG, "SSE heartbeat received"); return }
                try {
                    val apiResp = gson.fromJson(data, Map::class.java) as? Map<*, *>
                    @Suppress("UNCHECKED_CAST")
                    val messagesRaw = apiResp?.get("data") as? List<Map<String, Any>> ?: return
                    val messagesJson = gson.toJson(messagesRaw)
                    val type2 = object : TypeToken<List<PushMessage>>() {}.type
                    val messages: List<PushMessage> = gson.fromJson(messagesJson, type2)
                    if (messages.isNotEmpty()) {
                        onMessage(messages)
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "SSE parse error", e)
                }
            }

            override fun onClosed(eventSource: EventSource) {
                AppLogger.w(TAG, "SSE closed")
                onClosed()
            }

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                val code = response?.code
                AppLogger.e(TAG, "SSE failure: ${t?.message ?: "HTTP $code"}")
                if (code == 401) {
                    onAuthError?.invoke()
                } else {
                    onError(Exception(t?.message ?: "SSE connection failed"))
                }
            }
        }

        eventSource = EventSources.createFactory(client).newEventSource(request, listener)
    }

    fun stop() {
        AppLogger.d(TAG, "SSE stop() called")
        eventSource?.cancel()
        eventSource = null
    }

    companion object {
        private const val TAG = "SseClient"
    }
}

package com.notifyhub.client.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * WebSocket client for real-time push notification delivery.
 * Connects to /api/user/push/ws?uuid=xxx&token=jwt and receives messages.
 */
class WsClient(
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
        .readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private var ws: WebSocket? = null

    fun start() {
        AppLogger.i(TAG, "Starting WS connection")
        // Convert http(s):// to ws(s)://
        val wsUrl = serverUrl.trimEnd('/').let {
            it.replaceFirst("https://", "wss://")
                .replaceFirst("http://", "ws://")
        } + "/api/user/push/ws?uuid=$uuid&token=$jwtToken"

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                AppLogger.d(TAG, "WS connected")
                onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val parsed = gson.fromJson(text, Map::class.java) as? Map<*, *>

                    // Handle initial connected event
                    if (parsed?.get("event")?.toString() == "connected") {
                        AppLogger.d(TAG, "WS handshake confirmed")
                        return
                    }

                    @Suppress("UNCHECKED_CAST")
                    val messagesRaw = parsed?.get("data") as? List<Map<String, Any>> ?: return
                    val messagesJson = gson.toJson(messagesRaw)
                    val type = object : TypeToken<List<PushMessage>>() {}.type
                    val messages: List<PushMessage> = gson.fromJson(messagesJson, type)
                    if (messages.isNotEmpty()) {
                        onMessage(messages)
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "WS parse error", e)
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                AppLogger.d(TAG, "WS received binary message, ignored")
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                AppLogger.w(TAG, "WS closing: $code $reason")
                webSocket.close(1000, null)
                onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val code = response?.code
                AppLogger.e(TAG, "WS failure: ${t.message} (HTTP $code)")
                if (code == 401) {
                    onAuthError?.invoke()
                } else {
                    onError(Exception(t.message ?: "WebSocket connection failed"))
                }
            }
        })
    }

    fun stop() {
        AppLogger.d(TAG, "WS stop() called")
        ws?.close(1000, "Client stopping")
        ws = null
    }

    companion object {
        private const val TAG = "WsClient"
    }
}

package com.notifyhub.client.ui

import android.content.Context
import android.widget.Toast
import com.notifyhub.client.data.ApiClient
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n

/**
 * Shared helper for the login-then-register flow used by ConfigScreen and SettingsScreen.
 * Uses Thread + Handler to avoid Compose coroutine lifecycle issues.
 */
object ConnectHelper {

    private const val TAG = "ConnectHelper"

    /**
     * Connect via JWT (from QR code): register with existing JWT, save config.
     */
    fun connectWithJwt(
        context: Context,
        serverUrl: String,
        jwt: String,
        clientUuid: String,
        clientName: String,
        onSuccess: (ClientConfig) -> Unit,
        onError: (String) -> Unit
    ) {
        Thread {
            try {
                AppLogger.d(TAG, "connectWithJwt: registering...")
                val api = ApiClient(serverUrl, jwt)
                val registered = api.register(clientUuid, clientName)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    if (registered) {
                        val newConfig = ClientConfig(
                            serverUrl = serverUrl,
                            username = "",
                            password = "",
                            jwtToken = jwt,
                            clientUuid = clientUuid,
                            clientName = clientName
                        )
                        ConfigStore.save(context, newConfig)
                        onSuccess(newConfig)
                    } else {
                        onError(I18n["settings_connect_failed"])
                    }
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "connectWithJwt failed", e)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    onError(e.message ?: I18n["settings_connect_failed"])
                }
            }
        }.start()
    }

    /**
     * Connect via username/password: login → get JWT → register → save config.
     */
    fun connectWithCredentials(
        context: Context,
        serverUrl: String,
        username: String,
        password: String,
        clientUuid: String,
        clientName: String,
        onSuccess: (ClientConfig) -> Unit,
        onError: (String) -> Unit
    ) {
        Thread {
            try {
                AppLogger.d(TAG, "connectWithCredentials: logging in...")
                val loginResult = ApiClient.login(serverUrl, username, password)
                if (loginResult.isFailure) {
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        onError(loginResult.exceptionOrNull()?.message ?: I18n["settings_connect_failed"])
                    }
                    return@Thread
                }
                val jwt = loginResult.getOrThrow()
                val api = ApiClient(serverUrl, jwt)
                val registered = api.register(clientUuid, clientName)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    if (registered) {
                        val newConfig = ClientConfig(serverUrl, username, password, jwt, clientUuid, clientName)
                        ConfigStore.save(context, newConfig)
                        onSuccess(newConfig)
                    } else {
                        onError(I18n["settings_connect_failed"])
                    }
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "connectWithCredentials failed", e)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    onError(e.message ?: I18n["settings_connect_failed"])
                }
            }
        }.start()
    }
}

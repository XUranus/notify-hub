package com.notifyhub.client.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject

data class ClientConfig(
    val serverUrl: String,
    val username: String,
    val password: String,
    val jwtToken: String,
    val clientUuid: String,
    val clientName: String
)

object ConfigStore {
    private const val PREFS_NAME = "notifyhub_config"

    // Observable theme state for Compose recomposition
    var themeMode by mutableIntStateOf(0)
        private set
    var colorSchemeIdx by mutableIntStateOf(0)
        private set

    fun init(context: Context) {
        themeMode = getThemeMode(context)
        colorSchemeIdx = getColorScheme(context)
    }
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_USERNAME = "username"
    private const val KEY_PASSWORD = "password"
    private const val KEY_JWT_TOKEN = "jwt_token"
    private const val KEY_CLIENT_UUID = "client_uuid"
    private const val KEY_CLIENT_NAME = "client_name"

    private fun prefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun load(context: Context): ClientConfig {
        val p = prefs(context)
        var uuid = p.getString(KEY_CLIENT_UUID, null)
        if (uuid == null) {
            uuid = DeviceId.generate(context)
            p.edit().putString(KEY_CLIENT_UUID, uuid).apply()
        }
        val config = ClientConfig(
            serverUrl = p.getString(KEY_SERVER_URL, "") ?: "",
            username = p.getString(KEY_USERNAME, "") ?: "",
            password = p.getString(KEY_PASSWORD, "") ?: "",
            jwtToken = p.getString(KEY_JWT_TOKEN, "") ?: "",
            clientUuid = uuid,
            clientName = p.getString(KEY_CLIENT_NAME, android.os.Build.MODEL) ?: android.os.Build.MODEL
        )
        AppLogger.d("ConfigStore", "Loaded config: serverUrl=${config.serverUrl}")
        return config
    }

    fun save(context: Context, config: ClientConfig) {
        prefs(context).edit().apply {
            putString(KEY_SERVER_URL, config.serverUrl)
            putString(KEY_USERNAME, config.username)
            putString(KEY_PASSWORD, config.password)
            putString(KEY_JWT_TOKEN, config.jwtToken)
            putString(KEY_CLIENT_NAME, config.clientName)
            apply()
        }
        AppLogger.i("ConfigStore", "Config saved")
    }

    fun saveJwtToken(context: Context, jwtToken: String) {
        prefs(context).edit().putString(KEY_JWT_TOKEN, jwtToken).apply()
    }

    fun clearJwt(context: Context) {
        prefs(context).edit()
            .putString(KEY_JWT_TOKEN, "")
            .putString(KEY_USERNAME, "")
            .putString(KEY_PASSWORD, "")
            .apply()
        AppLogger.i("ConfigStore", "JWT cleared")
    }

    fun isConfigured(context: Context): Boolean {
        val p = prefs(context)
        return !p.getString(KEY_SERVER_URL, "").isNullOrBlank()
                && (!p.getString(KEY_USERNAME, "").isNullOrBlank()
                || !p.getString(KEY_JWT_TOKEN, "").isNullOrBlank())
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
        AppLogger.i("ConfigStore", "All config cleared")
    }

    // Mute notification support
    private const val KEY_MUTE_UNTIL = "mute_until"

    fun getMuteUntil(context: Context): Long {
        return prefs(context).getLong(KEY_MUTE_UNTIL, 0)
    }

    fun isMuted(context: Context): Boolean {
        return System.currentTimeMillis() < getMuteUntil(context)
    }

    fun setMute(context: Context, durationMillis: Long) {
        val until = if (durationMillis <= 0) 0 else System.currentTimeMillis() + durationMillis
        prefs(context).edit().putLong(KEY_MUTE_UNTIL, until).apply()
    }

    fun clearMute(context: Context) {
        prefs(context).edit().putLong(KEY_MUTE_UNTIL, 0).apply()
    }

    // Auto-clean messages support
    private const val KEY_AUTO_CLEAN_DAYS = "auto_clean_days"

    fun getAutoCleanDays(context: Context): Int {
        return prefs(context).getInt(KEY_AUTO_CLEAN_DAYS, 0)
    }

    fun setAutoCleanDays(context: Context, days: Int) {
        prefs(context).edit().putInt(KEY_AUTO_CLEAN_DAYS, days).apply()
    }

    // Theme support
    private const val KEY_THEME_MODE = "theme_mode"       // 0=system, 1=light, 2=dark
    private const val KEY_COLOR_SCHEME = "color_scheme"   // 0=indigo, 1=blue, 2=teal, 3=green, 4=orange, 5=red, 6=purple

    fun getThemeMode(context: Context): Int = prefs(context).getInt(KEY_THEME_MODE, 0)
    fun setThemeMode(context: Context, mode: Int) {
        prefs(context).edit().putInt(KEY_THEME_MODE, mode).apply()
        themeMode = mode
    }

    fun getColorScheme(context: Context): Int = prefs(context).getInt(KEY_COLOR_SCHEME, 0)
    fun setColorScheme(context: Context, scheme: Int) {
        prefs(context).edit().putInt(KEY_COLOR_SCHEME, scheme).apply()
        colorSchemeIdx = scheme
    }

    // Auto-download images support
    private const val KEY_AUTO_DOWNLOAD_IMAGES = "auto_download_images"

    fun getAutoDownloadImages(context: Context): Boolean = prefs(context).getBoolean(KEY_AUTO_DOWNLOAD_IMAGES, false)
    fun setAutoDownloadImages(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_AUTO_DOWNLOAD_IMAGES, enabled).apply()

    // Logging support
    private const val KEY_LOG_ENABLED = "log_enabled"
    private const val KEY_LOG_LEVEL = "log_level"   // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR

    fun isLogEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_LOG_ENABLED, true)
    fun setLogEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_LOG_ENABLED, enabled).apply()

    fun getLogLevel(context: Context): Int = prefs(context).getInt(KEY_LOG_LEVEL, 1)
    fun setLogLevel(context: Context, level: Int) = prefs(context).edit().putInt(KEY_LOG_LEVEL, level).apply()

    // Topic view mode: "messages" | "topics"
    private const val KEY_VIEW_MODE = "view_mode"

    fun getViewMode(context: Context): String = prefs(context).getString(KEY_VIEW_MODE, "messages") ?: "messages"
    fun setViewMode(context: Context, mode: String) = prefs(context).edit().putString(KEY_VIEW_MODE, mode).apply()

    // Connection mode: "sse" | "ws" | "poll"
    private const val KEY_CONNECTION_MODE = "connection_mode"

    fun getConnectionMode(context: Context): String = prefs(context).getString(KEY_CONNECTION_MODE, "sse") ?: "sse"
    fun setConnectionMode(context: Context, mode: String) = prefs(context).edit().putString(KEY_CONNECTION_MODE, mode).apply()

    // ── FCM Settings ──
    private const val KEY_FCM_ENABLED = "fcm_enabled"
    fun isFcmEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_FCM_ENABLED, true)
    fun setFcmEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_FCM_ENABLED, enabled).apply()

    // ── FCM Token Timeout ──
    private const val KEY_FCM_TOKEN_TIMEOUT = "fcm_token_timeout"
    fun getFcmTokenTimeout(context: Context): Long {
        val value = prefs(context).getString(KEY_FCM_TOKEN_TIMEOUT, "3000") ?: "3000"
        return value.toLongOrNull() ?: 3000L
    }
    fun setFcmTokenTimeout(context: Context, timeoutMs: Long) {
        prefs(context).edit().putString(KEY_FCM_TOKEN_TIMEOUT, timeoutMs.toString()).apply()
    }

    // ── Keep-Alive Settings ──
    // Master switch — controls all keep-alive strategies
    private const val KEY_KEEP_ALIVE_ENABLED = "keep_alive_enabled"
    fun isKeepAliveEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_KEEP_ALIVE_ENABLED, true)
    fun setKeepAliveEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_KEEP_ALIVE_ENABLED, enabled).apply()

    // WorkManager periodic health check (checks service every 15 min)
    private const val KEY_KEEP_ALIVE_WORKMANAGER = "keep_alive_workmanager"
    fun isKeepAliveWorkManagerEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_KEEP_ALIVE_WORKMANAGER, true)
    fun setKeepAliveWorkManagerEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_KEEP_ALIVE_WORKMANAGER, enabled).apply()

    // Restart service when user swipes away from recents (onTaskRemoved)
    private const val KEY_KEEP_ALIVE_TASK_REMOVED = "keep_alive_task_removed"
    fun isKeepAliveTaskRemovedEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_KEEP_ALIVE_TASK_REMOVED, true)
    fun setKeepAliveTaskRemovedEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_KEEP_ALIVE_TASK_REMOVED, enabled).apply()

    // Auto-start service after device reboot
    private const val KEY_KEEP_ALIVE_BOOT = "keep_alive_boot"
    fun isKeepAliveBootEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_KEEP_ALIVE_BOOT, true)
    fun setKeepAliveBootEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_KEEP_ALIVE_BOOT, enabled).apply()

    // Auto-restart service if found dead (used by WorkManager worker)
    private const val KEY_KEEP_ALIVE_SERVICE_RESTART = "keep_alive_service_restart"
    fun isKeepAliveServiceRestartEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_KEEP_ALIVE_SERVICE_RESTART, true)
    fun setKeepAliveServiceRestartEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_KEEP_ALIVE_SERVICE_RESTART, enabled).apply()

    // Backup & Restore
    private val ALL_PREFS = listOf("notifyhub_config", "notifyhub_messages", "notifyhub_prefs")

    fun backupToJson(context: Context): String {
        val root = JSONObject()
        for (name in ALL_PREFS) {
            val sp = context.getSharedPreferences(name, Context.MODE_PRIVATE)
            val obj = JSONObject()
            for ((key, value) in sp.all) {
                obj.put(key, when (value) {
                    is String -> JSONObject().apply { put("type", "string"); put("value", value) }
                    is Int -> JSONObject().apply { put("type", "int"); put("value", value) }
                    is Long -> JSONObject().apply { put("type", "long"); put("value", value) }
                    is Float -> JSONObject().apply { put("type", "float"); put("value", value.toDouble()) }
                    is Boolean -> JSONObject().apply { put("type", "boolean"); put("value", value) }
                    else -> JSONObject().apply { put("type", "string"); put("value", value.toString()) }
                })
            }
            root.put(name, obj)
        }
        AppLogger.d("ConfigStore", "Backup created")
        return root.toString(2)
    }

    fun restoreFromJson(context: Context, json: String): Boolean {
        return try {
            val root = JSONObject(json)
            for (name in ALL_PREFS) {
                if (!root.has(name)) continue
                val obj = root.getJSONObject(name)
                val editor = context.getSharedPreferences(name, Context.MODE_PRIVATE).edit()
                for (key in obj.keys()) {
                    val entry = obj.getJSONObject(key)
                    when (entry.getString("type")) {
                        "string" -> editor.putString(key, entry.getString("value"))
                        "int" -> editor.putInt(key, entry.getInt("value"))
                        "long" -> editor.putLong(key, entry.getLong("value"))
                        "float" -> editor.putFloat(key, entry.getDouble("value").toFloat())
                        "boolean" -> editor.putBoolean(key, entry.getBoolean("value"))
                    }
                }
                editor.apply()
            }
            true
        } catch (e: Exception) {
            AppLogger.e("ConfigStore", "restoreFromJson failed", e)
            false
        }
    }
}

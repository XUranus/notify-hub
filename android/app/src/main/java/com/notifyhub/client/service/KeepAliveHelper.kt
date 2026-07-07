package com.notifyhub.client.service

import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.notifyhub.client.data.AppLogger

/**
 * Helpers for keep-alive strategies:
 * - Battery optimization detection
 * - Auto-start / self-launch permission detection (Chinese ROMs)
 */
object KeepAliveHelper {

    private const val TAG = "KeepAliveHelper"

    /**
     * Check if the app is ignoring battery optimizations.
     * On Android 6.0+ (API 23+), apps that don't ignore battery optimizations
     * may be restricted by Doze mode and have background execution limits.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Open battery optimization settings for this app so the user can
     * add it to the whitelist / "Don't optimize" list.
     */
    fun openBatteryOptimizationSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = android.net.Uri.parse("package:${context.packageName}")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            AppLogger.w(TAG, "Cannot open battery optimization settings: ${e.message}")
            // Fallback: open general battery settings
            try {
                context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {}
        }
    }

    /**
     * Check if the device manufacturer has a self-start / auto-start permission
     * that needs to be granted. Returns true if a known Chinese ROM is detected.
     */
    fun isChineseRom(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        return manufacturer in listOf(
            "xiaomi", "redmi", "poco",       // MIUI / HyperOS
            "huawei", "honor",                // EMUI / MagicOS
            "oppo", "oneplus", "realme",      // ColorOS / Realme UI
            "vivo", "iqoo",                   // OriginOS / Funtouch OS
            "samsung",                        // One UI (has its own battery settings)
            "meizu",                          // Flyme
            "sony",                           // Xperia
            "google",                         // Pixel (stock)
        )
    }

    /**
     * Try to open the manufacturer-specific auto-start / self-launch settings.
     * Returns true if a known intent was launched, false if fallback is needed.
     */
    fun openAutoStartSettings(context: Context): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        AppLogger.d(TAG, "Opening auto-start settings for: $manufacturer")

        return try {
            when {
                // Xiaomi / Redmi / POCO — MIUI AutoStart
                manufacturer in listOf("xiaomi", "redmi", "poco") -> {
                    val intent = Intent().apply {
                        component = ComponentName(
                            "com.miui.securitycenter",
                            "com.miui.permcenter.autostart.AutoStartManagementActivity"
                        )
                    }
                    context.startActivity(intent)
                    true
                }
                // Huawei / Honor — EMUI Startup Manager
                manufacturer in listOf("huawei", "honor") -> {
                    val intent = Intent().apply {
                        component = ComponentName(
                            "com.huawei.systemmanager",
                            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                        )
                    }
                    context.startActivity(intent)
                    true
                }
                // OPPO / OnePlus / Realme — ColorOS auto-start
                manufacturer in listOf("oppo", "oneplus", "realme") -> {
                    val intent = Intent().apply {
                        component = ComponentName(
                            "com.coloros.safecenter",
                            "com.coloros.safecenter.startupapp.StartupAppListActivity"
                        )
                    }
                    context.startActivity(intent)
                    true
                }
                // vivo / iQOO — Funtouch auto-start
                manufacturer in listOf("vivo", "iqoo") -> {
                    val intent = Intent().apply {
                        component = ComponentName(
                            "com.vivo.permissionmanager",
                            "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                        )
                    }
                    context.startActivity(intent)
                    true
                }
                // Samsung — Device care battery settings
                manufacturer == "samsung" -> {
                    val intent = Intent().apply {
                        component = ComponentName(
                            "com.samsung.android.lool",
                            "com.samsung.android.sm.battery.ui.BatteryActivity"
                        )
                    }
                    context.startActivity(intent)
                    true
                }
                // Meizu — Flyme auto-start
                manufacturer == "meizu" -> {
                    val intent = Intent("com.meizu.safe.security.SHOW_APPSEC").apply {
                        putExtra("packageName", context.packageName)
                        component = ComponentName("com.meizu.safe", "com.meizu.safe.security.AppSecActivity")
                    }
                    context.startActivity(intent)
                    true
                }
                else -> false
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "Failed to open auto-start settings for $manufacturer: ${e.message}")
            false
        }
    }

    /**
     * Open the app's own notification settings as a fallback.
     */
    fun openAppNotificationSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            AppLogger.w(TAG, "Cannot open notification settings: ${e.message}")
        }
    }
}

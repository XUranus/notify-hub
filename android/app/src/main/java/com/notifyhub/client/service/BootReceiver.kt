package com.notifyhub.client.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        AppLogger.d(TAG, "Received intent: ${intent.action}")
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            AppLogger.d(TAG, "Boot completed, checking if polling should start")
            val keepAliveEnabled = ConfigStore.isKeepAliveEnabled(context)
            val bootEnabled = ConfigStore.isKeepAliveBootEnabled(context)
            val configured = ConfigStore.isConfigured(context)
            AppLogger.d(TAG, "keepAlive=$keepAliveEnabled, boot=$bootEnabled, configured=$configured")
            if (keepAliveEnabled && bootEnabled && configured) {
                AppLogger.d(TAG, "Starting PollService on boot")
                val serviceIntent = Intent(context, PollService::class.java).apply {
                    action = PollService.ACTION_START
                }
                try {
                    context.startForegroundService(serviceIntent)
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to start PollService on boot", e)
                }
            }
        }
    }
}

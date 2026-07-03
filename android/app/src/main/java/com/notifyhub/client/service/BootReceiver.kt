package com.notifyhub.client.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.notifyhub.client.data.ConfigStore

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed, checking if polling should start")
            if (ConfigStore.isConfigured(context)) {
                Log.d(TAG, "Configured, starting PollService")
                val serviceIntent = Intent(context, PollService::class.java).apply {
                    action = PollService.ACTION_START
                }
                context.startForegroundService(serviceIntent)
            }
        }
    }
}

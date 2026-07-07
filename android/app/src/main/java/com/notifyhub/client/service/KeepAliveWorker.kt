package com.notifyhub.client.service

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import java.util.concurrent.TimeUnit

/**
 * Periodic worker that checks if PollService is alive and restarts it if needed.
 * Runs every 15 minutes (minimum interval for PeriodicWorkRequest).
 */
class KeepAliveWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "KeepAliveWorker"
        private const val WORK_NAME = "notifyhub_keepalive"

        /**
         * Enqueue the periodic keep-alive work.
         * Uses KEEP policy so a new request replaces any existing one.
         */
        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<KeepAliveWorker>(
                15, TimeUnit.MINUTES
            ).build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
            AppLogger.d(TAG, "Keep-alive worker enqueued (15min interval)")
        }

        /**
         * Cancel the periodic keep-alive work.
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            AppLogger.d(TAG, "Keep-alive worker cancelled")
        }
    }

    override suspend fun doWork(): Result {
        AppLogger.d(TAG, "Keep-alive check running...")

        // Check if master switch is enabled
        if (!ConfigStore.isKeepAliveEnabled(applicationContext)) {
            AppLogger.d(TAG, "Keep-alive master switch is OFF, skipping")
            return Result.success()
        }

        // Check if service auto-restart is enabled
        if (!ConfigStore.isKeepAliveServiceRestartEnabled(applicationContext)) {
            AppLogger.d(TAG, "Service restart keep-alive is OFF, skipping")
            return Result.success()
        }

        // Check if app is configured
        if (!ConfigStore.isConfigured(applicationContext)) {
            AppLogger.d(TAG, "App not configured, skipping")
            return Result.success()
        }

        // Try to start the foreground service
        try {
            val intent = Intent(applicationContext, PollService::class.java).apply {
                action = PollService.ACTION_START
            }
            applicationContext.startForegroundService(intent)
            AppLogger.d(TAG, "Keep-alive: PollService start requested")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Keep-alive: Failed to start PollService", e)
        }

        return Result.success()
    }
}

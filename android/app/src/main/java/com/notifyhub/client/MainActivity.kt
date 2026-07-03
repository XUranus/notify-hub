package com.notifyhub.client

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.*
import androidx.activity.compose.BackHandler
import androidx.core.content.ContextCompat
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.service.PollService
import com.notifyhub.client.ui.ConfigScreen
import com.notifyhub.client.ui.MainScreen
import com.notifyhub.client.ui.QrConnectData
import com.notifyhub.client.ui.QrScannerScreen
import com.notifyhub.client.ui.SettingsScreen
import com.notifyhub.client.ui.theme.NotifyHubTheme

class MainActivity : ComponentActivity() {

    private var pollService by mutableStateOf<PollService?>(null)
    private var bound by mutableStateOf(false)

    companion object {
        private const val TAG = "MainActivity"
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as PollService.LocalBinder
            pollService = binder.getService()
            bound = true
            AppLogger.d(TAG, "PollService bound, isConnected=${pollService?.isConnected?.value}")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            pollService = null
            bound = false
            AppLogger.d(TAG, "PollService unbound")
        }
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        I18n.init(this)
        AppLogger.init(this)
        requestNotificationPermission()
        handleNotificationIntent()

        setContent {
            NotifyHubTheme {
                var configured by remember { mutableStateOf(ConfigStore.isConfigured(this)) }
                var currentConfig by remember { mutableStateOf(ConfigStore.load(this)) }
                var showQrScanner by remember { mutableStateOf(false) }
                var pendingQrData by remember { mutableStateOf<QrConnectData?>(null) }
                var showSettings by remember { mutableStateOf(false) }

                when {
                    showQrScanner -> {
                        BackHandler { showQrScanner = false }
                        QrScannerScreen(
                            onResult = { data ->
                                pendingQrData = data
                                showQrScanner = false
                            },
                            onBack = { showQrScanner = false }
                        )
                    }
                    !configured -> {
                        ConfigScreen(
                            onSaved = { config ->
                                AppLogger.d(TAG, "ConfigScreen onSaved: serverUrl=${config.serverUrl}")
                                currentConfig = config
                                configured = true
                                startPollService()
                            },
                            onScanQr = { showQrScanner = true },
                            qrData = pendingQrData,
                            onQrDataConsumed = { pendingQrData = null }
                        )
                    }
                    showSettings -> {
                        BackHandler { showSettings = false }
                        SettingsScreen(
                            currentConfig = currentConfig,
                            onScanQr = { showQrScanner = true },
                            onBack = { showSettings = false },
                            onSave = { newConfig ->
                                ConfigStore.save(this, newConfig)
                                currentConfig = newConfig
                                pollService?.restart()
                                showSettings = false
                            }
                        )
                    }
                    else -> {
                        MainScreen(
                            config = currentConfig,
                            pollService = pollService,
                            onOpenSettings = { showSettings = true }
                        )
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (ConfigStore.isConfigured(this)) startPollService()
    }

    override fun onStop() {
        super.onStop()
        if (bound) { unbindService(connection); bound = false }
    }

    private fun handleNotificationIntent() {
        val messageId = intent?.getStringExtra("read_message_id")
        if (messageId != null) {
            lifecycleScope.launch { MessageStore.markAsRead(this@MainActivity, messageId) }
            intent.removeExtra("read_message_id")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun startPollService() {
        val intent = Intent(this, PollService::class.java).apply { action = PollService.ACTION_START }
        try { startForegroundService(intent) } catch (e: Exception) { AppLogger.e(TAG, "startForegroundService failed", e) }
        bindPollService()
    }

    private fun bindPollService() {
        if (!bound) {
            val intent = Intent(this, PollService::class.java)
            bindService(intent, connection, Context.BIND_AUTO_CREATE)
        }
    }
}

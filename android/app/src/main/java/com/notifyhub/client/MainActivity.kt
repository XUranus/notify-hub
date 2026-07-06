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
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import androidx.core.content.ContextCompat
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.service.PollService
import com.notifyhub.client.ui.ComposeScreen
import com.notifyhub.client.ui.ConfigScreen
import com.notifyhub.client.ui.MainScreen
import com.notifyhub.client.ui.QrConnectData
import com.notifyhub.client.ui.QrScannerScreen
import com.notifyhub.client.ui.SettingsScreen
import com.notifyhub.client.ui.theme.NotifyHubTheme

class MainActivity : ComponentActivity() {

    private var pollService by mutableStateOf<PollService?>(null)
    private var bound by mutableStateOf(false)
    private var pendingOpenMessageId by mutableStateOf<String?>(null)

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
    ) { granted -> AppLogger.d(TAG, "Notification permission: granted=$granted") }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        I18n.init(this)
        AppLogger.init(this)
        ConfigStore.init(this)
        requestNotificationPermission()
        handleNotificationIntent()

        setContent {
            NotifyHubTheme {
                var configured by remember { mutableStateOf(ConfigStore.isConfigured(this)) }
                var currentConfig by remember { mutableStateOf(ConfigStore.load(this)) }
                var showQrScanner by remember { mutableStateOf(false) }
                var pendingQrData by remember { mutableStateOf<QrConnectData?>(null) }
                var showSettings by remember { mutableStateOf(false) }
                var showCompose by remember { mutableStateOf(false) }
                var qrScanTarget by remember { mutableStateOf<String?>(null) } // "config" or "settings"

                // Handle notification click — open message detail
                LaunchedEffect(intent) {
                    val msgId = intent?.getStringExtra("open_message_id")
                    if (msgId != null) {
                        pendingOpenMessageId = msgId
                        intent.removeExtra("open_message_id")
                    }
                }

                val screenKey = when {
                    !configured -> "config"
                    showCompose -> "compose"
                    showSettings -> "settings"
                    !bound -> "loading" // wait for PollService to bind
                    else -> "main"
                }

                val screenOrder = mapOf("config" to 0, "main" to 1, "settings" to 2, "compose" to 2)

                AnimatedContent(
                    targetState = screenKey,
                    transitionSpec = {
                        val forward = (screenOrder[targetState] ?: 0) >= (screenOrder[initialState] ?: 0)
                        if (forward) {
                            slideInHorizontally(animationSpec = tween(300)) { it } togetherWith
                                slideOutHorizontally(animationSpec = tween(300)) { -it }
                        } else {
                            slideInHorizontally(animationSpec = tween(300)) { -it } togetherWith
                                slideOutHorizontally(animationSpec = tween(300)) { it }
                        }
                    },
                    label = "screenTransition"
                ) { target ->
                    when (target) {
                        "config" -> {
                            ConfigScreen(
                                onSaved = { config ->
                                    AppLogger.d(TAG, "ConfigScreen onSaved: serverUrl=${config.serverUrl}")
                                    currentConfig = config
                                    configured = true
                                    startPollService()
                                },
                                onScanQr = { qrScanTarget = "config"; showQrScanner = true },
                                qrData = if (qrScanTarget == "config") pendingQrData else null,
                                onQrDataConsumed = { pendingQrData = null }
                            )
                        }
                        "loading" -> {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    CircularProgressIndicator()
                                    Spacer(Modifier.height(16.dp))
                                    Text(
                                        I18n["status_connecting"],
                                        color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        "compose" -> {
                            BackHandler { showCompose = false }
                            ComposeScreen(
                                config = currentConfig,
                                onBack = { showCompose = false }
                            )
                        }
                        "settings" -> {
                            BackHandler { showSettings = false }
                            val service = pollService
                            SettingsScreen(
                                currentConfig = currentConfig,
                                onBack = { showSettings = false },
                                onSave = { newConfig ->
                                    currentConfig = newConfig
                                    showSettings = false
                                },
                                onLogout = {
                                    pollService?.switchAccount()
                                    val stopIntent = Intent(this@MainActivity, PollService::class.java).apply { action = PollService.ACTION_STOP }
                                    startService(stopIntent)
                                    pollService = null
                                    showSettings = false
                                    configured = false
                                },
                                onRestartService = {
                                    pollService?.restart()
                                },
                                onTrySwitchMode = if (service != null) {
                                    { mode -> service.trySwitchMode(mode) }
                                } else null,
                                actualConnectionMode = service?.actualConnectionMode?.value ?: "poll"
                            )
                        }
                        else -> {
                            MainScreen(
                                config = currentConfig,
                                pollService = pollService,
                                onOpenSettings = { showSettings = true },
                                onCompose = { showCompose = true },
                                openMessageId = pendingOpenMessageId,
                                onMessageOpened = { pendingOpenMessageId = null }
                            )
                        }
                    }
                }

                // QR Scanner overlay - shown on top of any screen
                if (showQrScanner) {
                    BackHandler { showQrScanner = false }
                    QrScannerScreen(
                        onResult = { data ->
                            pendingQrData = data
                            showQrScanner = false
                        },
                        onBack = { showQrScanner = false }
                    )
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        AppLogger.d(TAG, "onStart")
        if (ConfigStore.isConfigured(this)) startPollService()
    }

    override fun onStop() {
        super.onStop()
        AppLogger.d(TAG, "onStop, bound=$bound")
        if (bound) { unbindService(connection); bound = false }
    }

    private fun handleNotificationIntent() {
        val messageId = intent?.getStringExtra("open_message_id")
        if (messageId != null) {
            AppLogger.d(TAG, "Opening message from notification: $messageId")
            pendingOpenMessageId = messageId
            intent.removeExtra("open_message_id")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        AppLogger.d(TAG, "onNewIntent action=${intent.action}")
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
        AppLogger.i(TAG, "Starting PollService")
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

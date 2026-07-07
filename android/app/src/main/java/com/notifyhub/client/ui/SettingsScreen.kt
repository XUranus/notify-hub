package com.notifyhub.client.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.ColorLens
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

import com.notifyhub.client.data.ApiClient
import com.notifyhub.client.data.AppLogger
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.i18n
import com.notifyhub.client.service.KeepAliveHelper
import com.notifyhub.client.service.KeepAliveWorker
import com.notifyhub.client.ui.theme.palettes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    currentConfig: ClientConfig,
    onBack: () -> Unit,
    onSave: (ClientConfig) -> Unit,
    onLogout: () -> Unit = {},
    onRestartService: () -> Unit = {},
    onTrySwitchMode: (suspend (String) -> Boolean)? = null,
    actualConnectionMode: String = "poll"
) {
    val context = LocalContext.current
    var showDeviceNameDialog by remember { mutableStateOf(false) }
    var deviceName by remember { mutableStateOf(currentConfig.clientName) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(i18n("tab_settings"), fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = i18n("qr_back"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {
            // ── Server Info (read-only) ──
            SettingsSectionHeader(i18n("settings_server"))
            CopyableRow(context, i18n("config_server_url"), currentConfig.serverUrl, monospace = true)
            CopyableRow(context, i18n("config_username"), currentConfig.username)

            // ── Device Name (editable) ──
            SettingsSectionHeader(i18n("config_device_name"))
            ListItem(
                headlineContent = { Text(deviceName.ifBlank { android.os.Build.MODEL }, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                trailingContent = {
                    Icon(Icons.Default.ChevronRight, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                },
                modifier = Modifier.clickable { showDeviceNameDialog = true }
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Mute Notifications ──
            SettingsSectionHeader(i18n("settings_mute"))
            var muteMenuExpanded by remember { mutableStateOf(false) }
            var isMuted by remember { mutableStateOf(ConfigStore.isMuted(context)) }
            val muteOptions = listOf(
                0L to i18n("mute_off"),
                30 * 60 * 1000L to i18n("mute_30min"),
                60 * 60 * 1000L to i18n("mute_1h"),
                4 * 60 * 60 * 1000L to i18n("mute_4h"),
                8 * 60 * 60 * 1000L to i18n("mute_8h"),
                24 * 60 * 60 * 1000L to i18n("mute_24h"),
            )
            val currentMuteLabel = if (isMuted) {
                val remain = ConfigStore.getMuteUntil(context) - System.currentTimeMillis()
                when {
                    remain > 8 * 3600_000 -> i18n("mute_24h")
                    remain > 4 * 3600_000 -> i18n("mute_8h")
                    remain > 3600_000 -> i18n("mute_4h")
                    remain > 30 * 60_000 -> i18n("mute_1h")
                    else -> i18n("mute_30min")
                }
            } else i18n("mute_off")
            Box {
                ListItem(
                    headlineContent = { Text(currentMuteLabel, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                    leadingContent = {
                        Icon(
                            if (isMuted) Icons.Default.VolumeOff else Icons.Default.VolumeUp,
                            contentDescription = null,
                            tint = if (isMuted) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp)
                        )
                    },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { muteMenuExpanded = true }
                )
                DropdownMenu(expanded = muteMenuExpanded, onDismissRequest = { muteMenuExpanded = false }) {
                    muteOptions.forEach { (duration, label) ->
                        DropdownMenuItem(
                            text = {
                                Text(label, fontWeight = if (
                                    (duration == 0L && !isMuted) ||
                                    (duration > 0 && isMuted)
                                ) FontWeight.Bold else FontWeight.Normal)
                            },
                            onClick = {
                                if (duration == 0L) ConfigStore.clearMute(context)
                                else ConfigStore.setMute(context, duration)
                                isMuted = ConfigStore.isMuted(context)
                                muteMenuExpanded = false
                            }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Notification Permission ──
            val notificationsEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            } else {
                // On Android < 13, notifications are enabled by default
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                nm.areNotificationsEnabled()
            }
            ListItem(
                headlineContent = {
                    Text(
                        if (notificationsEnabled) i18n("notif_permission_enabled") else i18n("notif_permission_disabled"),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (notificationsEnabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error
                    )
                },
                supportingContent = {
                    if (!notificationsEnabled) {
                        Text(i18n("notif_permission_hint"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                leadingContent = {
                    Icon(
                        if (notificationsEnabled) Icons.Default.Notifications else Icons.Default.NotificationsOff,
                        contentDescription = null,
                        tint = if (notificationsEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(22.dp)
                    )
                },
                trailingContent = {
                    if (!notificationsEnabled) {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                modifier = Modifier.clickable {
                    if (!notificationsEnabled) {
                        // Open system notification settings for this app
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        }
                        context.startActivity(intent)
                    }
                }
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── FCM Settings ──
            var fcmEnabled by remember { mutableStateOf(ConfigStore.isFcmEnabled(context)) }
            ListItem(
                headlineContent = { Text(i18n("fcm_enabled"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text(i18n("fcm_enabled_desc"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.Notifications, contentDescription = null,
                        tint = if (fcmEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp))
                },
                trailingContent = {
                    Switch(
                        checked = fcmEnabled,
                        onCheckedChange = {
                            fcmEnabled = it
                            ConfigStore.setFcmEnabled(context, it)
                        }
                    )
                }
            )

            // ── FCM Token Timeout ──
            SettingsSectionHeader(i18n("fcm_token_timeout"))
            val fcmTimeoutOptions = listOf(1000L, 3000L, 5000L)
            val fcmTimeoutLabels = listOf(i18n("fcm_token_timeout_1s"), i18n("fcm_token_timeout_3s"), i18n("fcm_token_timeout_5s"))
            var fcmTimeoutExpanded by remember { mutableStateOf(false) }
            var fcmTimeoutIndex by remember {
                val current = ConfigStore.getFcmTokenTimeout(context)
                mutableStateOf(fcmTimeoutOptions.indexOf(current).coerceAtLeast(1))
            }

            ListItem(
                headlineContent = { Text(i18n("fcm_token_timeout"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text(i18n("fcm_token_timeout_desc"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.Timer, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(22.dp))
                },
                trailingContent = {
                    Box {
                        Text(
                            fcmTimeoutLabels[fcmTimeoutIndex],
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clickable { fcmTimeoutExpanded = true }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                        DropdownMenu(expanded = fcmTimeoutExpanded, onDismissRequest = { fcmTimeoutExpanded = false }) {
                            fcmTimeoutLabels.forEachIndexed { idx, label ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        fcmTimeoutIndex = idx
                                        ConfigStore.setFcmTokenTimeout(context, fcmTimeoutOptions[idx])
                                        fcmTimeoutExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Keep-Alive Settings ──
            SettingsSectionHeader(i18n("settings_keep_alive"))
            var keepAliveMaster by remember { mutableStateOf(ConfigStore.isKeepAliveEnabled(context)) }
            val keepAliveScope = rememberCoroutineScope()

            ListItem(
                headlineContent = { Text(i18n("keep_alive_master"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text(i18n("keep_alive_master_hint"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.Power, contentDescription = null,
                        tint = if (keepAliveMaster) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp))
                },
                trailingContent = {
                    Switch(
                        checked = keepAliveMaster,
                        onCheckedChange = {
                            keepAliveMaster = it
                            ConfigStore.setKeepAliveEnabled(context, it)
                            // Sync WorkManager when master switch changes
                            if (it && ConfigStore.isKeepAliveWorkManagerEnabled(context)) {
                                KeepAliveWorker.enqueue(context)
                            } else {
                                KeepAliveWorker.cancel(context)
                            }
                        }
                    )
                }
            )

            // Sub-toggles (only visible when master is on)
            if (keepAliveMaster) {
                // WorkManager periodic check
                var keepAliveWorkManager by remember { mutableStateOf(ConfigStore.isKeepAliveWorkManagerEnabled(context)) }
                ListItem(
                    headlineContent = { Text(i18n("keep_alive_workmanager"), fontSize = 14.sp) },
                    supportingContent = { Text(i18n("keep_alive_workmanager_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.padding(start = 16.dp),
                    trailingContent = {
                        Switch(
                            checked = keepAliveWorkManager,
                            onCheckedChange = {
                                keepAliveWorkManager = it
                                ConfigStore.setKeepAliveWorkManagerEnabled(context, it)
                                if (it) KeepAliveWorker.enqueue(context) else KeepAliveWorker.cancel(context)
                            }
                        )
                    }
                )

                // Restart on task removed
                var keepAliveTaskRemoved by remember { mutableStateOf(ConfigStore.isKeepAliveTaskRemovedEnabled(context)) }
                ListItem(
                    headlineContent = { Text(i18n("keep_alive_task_removed"), fontSize = 14.sp) },
                    supportingContent = { Text(i18n("keep_alive_task_removed_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.padding(start = 16.dp),
                    trailingContent = {
                        Switch(
                            checked = keepAliveTaskRemoved,
                            onCheckedChange = {
                                keepAliveTaskRemoved = it
                                ConfigStore.setKeepAliveTaskRemovedEnabled(context, it)
                            }
                        )
                    }
                )

                // Auto-restart service
                var keepAliveServiceRestart by remember { mutableStateOf(ConfigStore.isKeepAliveServiceRestartEnabled(context)) }
                ListItem(
                    headlineContent = { Text(i18n("keep_alive_service_restart"), fontSize = 14.sp) },
                    supportingContent = { Text(i18n("keep_alive_service_restart_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.padding(start = 16.dp),
                    trailingContent = {
                        Switch(
                            checked = keepAliveServiceRestart,
                            onCheckedChange = {
                                keepAliveServiceRestart = it
                                ConfigStore.setKeepAliveServiceRestartEnabled(context, it)
                            }
                        )
                    }
                )

                // Boot auto-start
                var keepAliveBoot by remember { mutableStateOf(ConfigStore.isKeepAliveBootEnabled(context)) }
                ListItem(
                    headlineContent = { Text(i18n("keep_alive_boot"), fontSize = 14.sp) },
                    supportingContent = { Text(i18n("keep_alive_boot_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.padding(start = 16.dp),
                    trailingContent = {
                        Switch(
                            checked = keepAliveBoot,
                            onCheckedChange = {
                                keepAliveBoot = it
                                ConfigStore.setKeepAliveBootEnabled(context, it)
                            }
                        )
                    }
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

                // Battery optimization status
                val batteryOk = KeepAliveHelper.isIgnoringBatteryOptimizations(context)
                ListItem(
                    headlineContent = {
                        Text(
                            if (batteryOk) i18n("keep_alive_battery_enabled") else i18n("keep_alive_battery_disabled"),
                            fontSize = 14.sp,
                            color = if (batteryOk) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error
                        )
                    },
                    supportingContent = { Text(i18n("keep_alive_battery_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    leadingContent = {
                        Icon(Icons.Default.BatteryChargingFull, contentDescription = null,
                            tint = if (batteryOk) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp))
                    },
                    trailingContent = {
                        if (!batteryOk) {
                            TextButton(onClick = { KeepAliveHelper.openBatteryOptimizationSettings(context) }) {
                                Text(i18n("keep_alive_battery_action"), fontSize = 12.sp)
                            }
                        }
                    },
                    modifier = Modifier.padding(start = 16.dp)
                )

                // Auto-start permission (for Chinese ROMs)
                if (KeepAliveHelper.isChineseRom()) {
                    ListItem(
                        headlineContent = { Text(i18n("keep_alive_autostart"), fontSize = 14.sp) },
                        supportingContent = { Text(i18n("keep_alive_autostart_hint"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        leadingContent = {
                            Icon(Icons.Default.FlashOn, contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp))
                        },
                        trailingContent = {
                            TextButton(onClick = {
                                if (!KeepAliveHelper.openAutoStartSettings(context)) {
                                    KeepAliveHelper.openAppNotificationSettings(context)
                                }
                            }) {
                                Text(i18n("keep_alive_autostart_action"), fontSize = 12.sp)
                            }
                        },
                        modifier = Modifier.padding(start = 16.dp)
                    )
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Auto Download Images ──
            var autoDownloadImages by remember { mutableStateOf(ConfigStore.getAutoDownloadImages(context)) }
            ListItem(
                headlineContent = { Text(i18n("auto_download_images"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text(i18n("auto_download_images_hint"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(
                        Icons.Default.Image,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(22.dp)
                    )
                },
                trailingContent = {
                    Switch(
                        checked = autoDownloadImages,
                        onCheckedChange = {
                            autoDownloadImages = it
                            ConfigStore.setAutoDownloadImages(context, it)
                        }
                    )
                }
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Connection Mode ──
            SettingsSectionHeader(i18n("settings_connection"))
            var connMenuExpanded by remember { mutableStateOf(false) }
            var currentConnMode by remember { mutableStateOf(actualConnectionMode) }
            var isSwitchingMode by remember { mutableStateOf(false) }
            var modeSwitchError by remember { mutableStateOf<String?>(null) }
            val connModes = listOf(
                "sse" to i18n("conn_sse"),
                "ws" to i18n("conn_ws"),
                "poll" to i18n("conn_poll"),
            )
            val currentConnLabel = connModes.find { it.first == currentConnMode }?.second ?: i18n("conn_sse")
            val switchScope = rememberCoroutineScope()
            Box {
                ListItem(
                    headlineContent = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(currentConnLabel, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            if (isSwitchingMode) {
                                Spacer(Modifier.width(8.dp))
                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            }
                        }
                    },
                    supportingContent = {
                        if (modeSwitchError != null) {
                            Text(modeSwitchError!!, fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                        } else {
                            Text(i18n("settings_connection_hint"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    leadingContent = {
                        Icon(Icons.Default.SwapHoriz, contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                    },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { if (!isSwitchingMode) connMenuExpanded = true }
                )
                DropdownMenu(expanded = connMenuExpanded, onDismissRequest = { connMenuExpanded = false }) {
                    connModes.forEach { (mode, label) ->
                        DropdownMenuItem(
                            text = { Text(label, fontWeight = if (mode == currentConnMode) FontWeight.Bold else FontWeight.Normal) },
                            onClick = {
                                connMenuExpanded = false
                                if (mode == currentConnMode) return@DropdownMenuItem
                                if (onTrySwitchMode != null) {
                                    isSwitchingMode = true
                                    modeSwitchError = null
                                    switchScope.launch {
                                        val success = onTrySwitchMode(mode)
                                        isSwitchingMode = false
                                        if (success) {
                                            currentConnMode = mode
                                            modeSwitchError = null
                                        } else {
                                            modeSwitchError = i18n("mode_switch_failed")
                                            // Revert UI to actual mode after a delay
                                            delay(3000)
                                            currentConnMode = ConfigStore.getConnectionMode(context)
                                            modeSwitchError = null
                                        }
                                    }
                                } else {
                                    // Fallback: no validation
                                    ConfigStore.setConnectionMode(context, mode)
                                    currentConnMode = mode
                                    onRestartService()
                                }
                            }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Auto Clean ──
            SettingsSectionHeader(i18n("settings_auto_clean"))
            var cleanMenuExpanded by remember { mutableStateOf(false) }
            val cleanDays = remember { mutableStateOf(ConfigStore.getAutoCleanDays(context)) }
            val cleanOptions = listOf(
                0 to i18n("clean_never"),
                1 to i18n("clean_1day"),
                3 to i18n("clean_3days"),
                7 to i18n("clean_1week"),
                30 to i18n("clean_1month"),
                90 to i18n("clean_3months"),
            )
            val currentCleanLabel = cleanOptions.find { it.first == cleanDays.value }?.second ?: i18n("clean_never")
            Box {
                ListItem(
                    headlineContent = { Text(currentCleanLabel, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                    leadingContent = {
                        Icon(
                            Icons.Default.CleaningServices,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp)
                        )
                    },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { cleanMenuExpanded = true }
                )
                DropdownMenu(expanded = cleanMenuExpanded, onDismissRequest = { cleanMenuExpanded = false }) {
                    cleanOptions.forEach { (days, label) ->
                        DropdownMenuItem(
                            text = {
                                Text(label, fontWeight = if (days == cleanDays.value) FontWeight.Bold else FontWeight.Normal)
                            },
                            onClick = {
                                ConfigStore.setAutoCleanDays(context, days)
                                cleanDays.value = days
                                cleanMenuExpanded = false
                            }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Language ──
            SettingsSectionHeader(i18n("settings_language"))
            var langMenuExpanded by remember { mutableStateOf(false) }
            val currentLangName = I18n.languages.find { it.first == I18n.lang }?.second ?: "English"
            Box {
                ListItem(
                    headlineContent = { Text(currentLangName, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { langMenuExpanded = true }
                )
                DropdownMenu(expanded = langMenuExpanded, onDismissRequest = { langMenuExpanded = false }) {
                    I18n.languages.forEach { (code, name) ->
                        DropdownMenuItem(
                            text = { Text(name, fontWeight = if (code == I18n.lang) FontWeight.Bold else FontWeight.Normal) },
                            onClick = { I18n.setLanguage(context, code); langMenuExpanded = false }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Appearance ──
            SettingsSectionHeader(i18n("settings_appearance"))

            // Theme mode
            var themeModeMenuExpanded by remember { mutableStateOf(false) }
            val themeModes = listOf(
                0 to i18n("theme_system"),
                1 to i18n("theme_light"),
                2 to i18n("theme_dark"),
            )
            var currentThemeMode by remember { mutableIntStateOf(ConfigStore.getThemeMode(context)) }
            val currentThemeLabel = themeModes.find { it.first == currentThemeMode }?.second ?: i18n("theme_system")
            Box {
                ListItem(
                    headlineContent = { Text(currentThemeLabel, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                    supportingContent = { Text(i18n("settings_theme_mode"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    leadingContent = {
                        Icon(Icons.Default.DarkMode, contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                    },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { themeModeMenuExpanded = true }
                )
                DropdownMenu(expanded = themeModeMenuExpanded, onDismissRequest = { themeModeMenuExpanded = false }) {
                    themeModes.forEach { (mode, label) ->
                        DropdownMenuItem(
                            text = { Text(label, fontWeight = if (mode == currentThemeMode) FontWeight.Bold else FontWeight.Normal) },
                            onClick = {
                                ConfigStore.setThemeMode(context, mode)
                                currentThemeMode = mode
                                themeModeMenuExpanded = false
                            }
                        )
                    }
                }
            }

            // Color scheme
            var colorMenuExpanded by remember { mutableStateOf(false) }
            var currentColorIdx by remember { mutableIntStateOf(ConfigStore.getColorScheme(context)) }
            val colorNames = listOf(
                i18n("color_indigo"), i18n("color_blue"), i18n("color_teal"),
                i18n("color_green"), i18n("color_orange"), i18n("color_red"), i18n("color_purple")
            )
            Box {
                ListItem(
                    headlineContent = { Text(colorNames.getOrElse(currentColorIdx) { colorNames[0] }, fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                    supportingContent = { Text(i18n("settings_color_scheme"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    leadingContent = {
                        Icon(Icons.Default.ColorLens, contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                    },
                    trailingContent = {
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { colorMenuExpanded = true }
                )
                DropdownMenu(expanded = colorMenuExpanded, onDismissRequest = { colorMenuExpanded = false }) {
                    palettes.forEachIndexed { idx, (name, palette) ->
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(palette.primary)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        colorNames.getOrElse(idx) { name },
                                        fontWeight = if (idx == currentColorIdx) FontWeight.Bold else FontWeight.Normal
                                    )
                                }
                            },
                            onClick = {
                                ConfigStore.setColorScheme(context, idx)
                                currentColorIdx = idx
                                colorMenuExpanded = false
                            }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Logging ──
            SettingsSectionHeader(i18n("settings_logging"))
            var logEnabled by remember { mutableStateOf(ConfigStore.isLogEnabled(context)) }
            var logLevelMenuExpanded by remember { mutableStateOf(false) }
            var currentLogLevel by remember { mutableIntStateOf(ConfigStore.getLogLevel(context)) }
            val logLevels = listOf(
                0 to "DEBUG",
                1 to "INFO",
                2 to "WARN",
                3 to "ERROR",
            )
            ListItem(
                headlineContent = { Text(i18n("settings_log_enabled"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                leadingContent = {
                    Icon(Icons.Default.Description, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                trailingContent = {
                    Switch(
                        checked = logEnabled,
                        onCheckedChange = {
                            logEnabled = it
                            ConfigStore.setLogEnabled(context, it)
                            AppLogger.refresh(context)
                        }
                    )
                }
            )
            if (logEnabled) {
                Box {
                    ListItem(
                        headlineContent = {
                            Text(logLevels.find { it.first == currentLogLevel }?.second ?: "INFO", fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace)
                        },
                        supportingContent = { Text(i18n("settings_log_level"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        modifier = Modifier.clickable { logLevelMenuExpanded = true }
                    )
                    DropdownMenu(expanded = logLevelMenuExpanded, onDismissRequest = { logLevelMenuExpanded = false }) {
                        logLevels.forEach { (level, name) ->
                            DropdownMenuItem(
                                text = { Text(name, fontWeight = if (level == currentLogLevel) FontWeight.Bold else FontWeight.Normal, fontFamily = FontFamily.Monospace) },
                                onClick = {
                                    ConfigStore.setLogLevel(context, level)
                                    currentLogLevel = level
                                    AppLogger.refresh(context)
                                    logLevelMenuExpanded = false
                                }
                            )
                        }
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Backup & Restore ──
            SettingsSectionHeader(i18n("settings_backup"))
            val backupJson = remember { mutableStateOf<String?>(null) }
            val scope = rememberCoroutineScope()

            val backupLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.CreateDocument("application/json")
            ) { uri: Uri? ->
                if (uri != null && backupJson.value != null) {
                    scope.launch {
                        withContext(Dispatchers.IO) {
                            context.contentResolver.openOutputStream(uri)?.use { os ->
                                os.write(backupJson.value!!.toByteArray())
                            }
                        }
                        Toast.makeText(context, i18n("backup_success"), Toast.LENGTH_SHORT).show()
                        backupJson.value = null
                    }
                }
            }

            ListItem(
                headlineContent = { Text(i18n("settings_backup_export"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                leadingContent = {
                    Icon(Icons.Default.Backup, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable {
                    backupJson.value = ConfigStore.backupToJson(context)
                    backupLauncher.launch("notifyhub_backup_${System.currentTimeMillis()}.json")
                }
            )

            var showRestoreConfirm by remember { mutableStateOf(false) }
            var pendingRestoreUri by remember { mutableStateOf<Uri?>(null) }

            val restoreLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.OpenDocument()
            ) { uri: Uri? ->
                if (uri != null) {
                    pendingRestoreUri = uri
                    showRestoreConfirm = true
                }
            }

            ListItem(
                headlineContent = { Text(i18n("settings_backup_restore"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                leadingContent = {
                    Icon(Icons.Default.Restore, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable {
                    restoreLauncher.launch(arrayOf("application/json"))
                }
            )

            if (showRestoreConfirm) {
                AlertDialog(
                    onDismissRequest = { showRestoreConfirm = false; pendingRestoreUri = null },
                    title = { Text(i18n("restore_confirm_title")) },
                    text = { Text(i18n("restore_confirm_text")) },
                    confirmButton = {
                        TextButton(onClick = {
                            scope.launch {
                                val json = withContext(Dispatchers.IO) {
                                    pendingRestoreUri?.let { uri ->
                                        context.contentResolver.openInputStream(uri)?.use { it.bufferedReader().readText() }
                                    }
                                }
                                if (json != null && ConfigStore.restoreFromJson(context, json)) {
                                    Toast.makeText(context, i18n("restore_success"), Toast.LENGTH_SHORT).show()
                                    // Reload config and restart
                                    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                                    intent?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
                                    context.startActivity(intent)
                                    Runtime.getRuntime().exit(0)
                                } else {
                                    Toast.makeText(context, i18n("restore_failed"), Toast.LENGTH_LONG).show()
                                }
                                showRestoreConfirm = false
                                pendingRestoreUri = null
                            }
                        }) {
                            Text(i18n("confirm"), color = MaterialTheme.colorScheme.error)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showRestoreConfirm = false; pendingRestoreUri = null }) {
                            Text(i18n("cancel"))
                        }
                    }
                )
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Read-only info ──
            SettingsSectionHeader(i18n("settings_system"))
            CopyableRow(context, i18n("dash_uuid"), currentConfig.clientUuid, monospace = true)
            CopyableRow(context, i18n("dash_system"), "Android / ${System.getProperty("os.arch") ?: "arm64"}")
            CopyableRow(context, i18n("settings_app_version"), "0.2.0")
            CopyableRow(context, i18n("settings_platform"), "Android ${android.os.Build.VERSION.RELEASE}")
            CopyableRow(context, i18n("config_device_name"), currentConfig.clientName)
            CopyableRow(context, i18n("settings_sdk"), "API ${android.os.Build.VERSION.SDK_INT}")
            CopyableRow(context, i18n("settings_device"), "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── About ──
            SettingsSectionHeader(i18n("about"))
            ListItem(
                headlineContent = { Text(i18n("about_github"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text("github.com/XUranus/NotifyHub", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.Code, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/XUranus/NotifyHub")))
                }
            )
            ListItem(
                headlineContent = { Text(i18n("about_docs"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text("xuranus.github.com/notify-hub", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.MenuBook, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://xuranus.github.com/notify-hub")))
                }
            )
            ListItem(
                headlineContent = { Text(i18n("about_email"), fontSize = 15.sp, fontWeight = FontWeight.Medium) },
                supportingContent = { Text("xuranus@foxmail.com", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                leadingContent = {
                    Icon(Icons.Default.Email, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("mailto:xuranus@foxmail.com")))
                }
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Logout ──
            var showLogoutConfirm by remember { mutableStateOf(false) }
            ListItem(
                headlineContent = {
                    Text(i18n("logout"), fontSize = 15.sp, fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.error)
                },
                leadingContent = {
                    Icon(Icons.Default.ExitToApp, contentDescription = null,
                        tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable { showLogoutConfirm = true }
            )

            if (showLogoutConfirm) {
                AlertDialog(
                    onDismissRequest = { showLogoutConfirm = false },
                    title = { Text(i18n("logout")) },
                    text = { Text(i18n("logout_confirm")) },
                    confirmButton = {
                        TextButton(onClick = {
                            ConfigStore.clearJwt(context)
                            showLogoutConfirm = false
                            onLogout()
                        }) {
                            Text(i18n("confirm"), color = MaterialTheme.colorScheme.error)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showLogoutConfirm = false }) {
                            Text(i18n("cancel"))
                        }
                    }
                )
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))

            // ── Clear All Messages ──
            var showClearConfirm by remember { mutableStateOf(false) }
            ListItem(
                headlineContent = {
                    Text(i18n("settings_clear_messages"), fontSize = 15.sp, fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.error)
                },
                leadingContent = {
                    Icon(Icons.Default.DeleteForever, contentDescription = null,
                        tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
                },
                modifier = Modifier.clickable { showClearConfirm = true }
            )

            if (showClearConfirm) {
                AlertDialog(
                    onDismissRequest = { showClearConfirm = false },
                    title = { Text(i18n("clear_messages_confirm_title")) },
                    text = { Text(i18n("clear_messages_confirm_text")) },
                    confirmButton = {
                        TextButton(onClick = {
                            scope.launch {
                                MessageStore.deleteAll(context)
                                Toast.makeText(context, i18n("clear_messages_success"), Toast.LENGTH_SHORT).show()
                            }
                            showClearConfirm = false
                        }) {
                            Text(i18n("confirm"), color = MaterialTheme.colorScheme.error)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showClearConfirm = false }) {
                            Text(i18n("cancel"))
                        }
                    }
                )
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    if (showDeviceNameDialog) {
        val dialogScope = rememberCoroutineScope()
        var editName by remember { mutableStateOf(deviceName) }
        var isSavingName by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!isSavingName) showDeviceNameDialog = false },
            title = { Text(i18n("config_device_name")) },
            text = {
                OutlinedTextField(
                    value = editName,
                    onValueChange = { editName = it },
                    label = { Text(i18n("config_device_name")) },
                    singleLine = true,
                    enabled = !isSavingName,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val newName = editName.trim().ifBlank { android.os.Build.MODEL }
                        isSavingName = true
                        dialogScope.launch {
                            val api = ApiClient(currentConfig.serverUrl, currentConfig.jwtToken)
                            val ok = withContext(Dispatchers.IO) {
                                api.updateClient(currentConfig.clientUuid, newName)
                            }
                            if (ok) {
                                deviceName = newName
                                val newConfig = currentConfig.copy(clientName = newName)
                                ConfigStore.save(context, newConfig)
                                onSave(newConfig)
                                Toast.makeText(context, i18n("settings_saved"), Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, i18n("settings_connect_failed"), Toast.LENGTH_SHORT).show()
                            }
                            isSavingName = false
                            showDeviceNameDialog = false
                        }
                    },
                    enabled = !isSavingName
                ) {
                    if (isSavingName) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(i18n("confirm"))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeviceNameDialog = false },
                    enabled = !isSavingName
                ) {
                    Text(i18n("cancel"))
                }
            }
        )
    }
}

@Composable
private fun SettingsSectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 13.sp,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 4.dp)
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CopyableRow(context: Context, label: String, value: String, monospace: Boolean = false) {
    ListItem(
        headlineContent = {
            Text(value, fontSize = 14.sp,
                fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        },
        supportingContent = {
            Text(label, fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        },
        modifier = Modifier.combinedClickable(
            onClick = {},
            onDoubleClick = {
                val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cb.setPrimaryClip(ClipData.newPlainText(label, value))
                Toast.makeText(context, i18n("dash_copied"), Toast.LENGTH_SHORT).show()
            },
            onLongClick = {
                val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cb.setPrimaryClip(ClipData.newPlainText(label, value))
                Toast.makeText(context, i18n("dash_copied"), Toast.LENGTH_SHORT).show()
            }
        ),
    )
}


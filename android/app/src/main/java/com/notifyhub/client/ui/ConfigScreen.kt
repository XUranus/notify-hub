package com.notifyhub.client.ui

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.i18n

@Composable
fun ConfigScreen(
    onSaved: (ClientConfig) -> Unit,
    onScanQr: () -> Unit,
    qrData: QrConnectData? = null,
    onQrDataConsumed: () -> Unit = {}
) {
    val context = LocalContext.current
    val config = remember { ConfigStore.load(context) }

    var serverUrl by remember { mutableStateOf(config.serverUrl) }
    var username by remember { mutableStateOf(config.username) }
    var password by remember { mutableStateOf(config.password) }
    var showPassword by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }

    // QR auto-connect — uses ConnectHelper to avoid coroutine scope cancellation
    LaunchedEffect(qrData) {
        if (qrData?.jwt != null) {
            val qrServerUrl = qrData.serverUrl
            val qrJwt = qrData.jwt
            val deviceUuid = config.clientUuid
            val deviceName = android.os.Build.MODEL

            isLoading = true
            onQrDataConsumed()

            ConnectHelper.connectWithJwt(
                context = context,
                serverUrl = qrServerUrl,
                jwt = qrJwt,
                clientUuid = deviceUuid,
                clientName = deviceName,
                onSuccess = { newConfig -> isLoading = false; onSaved(newConfig) },
                onError = { msg -> isLoading = false; Toast.makeText(context, msg, Toast.LENGTH_LONG).show() }
            )
        } else if (qrData != null) {
            username = qrData.username
            password = qrData.password
            onQrDataConsumed()
        }
    }

    // Manual login — uses ConnectHelper
    var loginTrigger by remember { mutableIntStateOf(0) }

    LaunchedEffect(loginTrigger) {
        if (loginTrigger == 0) return@LaunchedEffect

        isLoading = true
        ConnectHelper.connectWithCredentials(
            context = context,
            serverUrl = serverUrl.trim(),
            username = username.trim(),
            password = password.trim(),
            clientUuid = config.clientUuid,
            clientName = android.os.Build.MODEL,
            onSuccess = { newConfig -> isLoading = false; onSaved(newConfig) },
            onError = { msg -> isLoading = false; Toast.makeText(context, msg, Toast.LENGTH_LONG).show() }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(Modifier.height(32.dp))

        // Title
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Notifications,
                contentDescription = null,
                modifier = Modifier.size(36.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = i18n("app_name"),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold
            )
        }

        Text(
            text = i18n("config_desc"),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(8.dp))

        // Server URL
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text(i18n("config_server_url")) },
            placeholder = { Text("http://192.168.x.x:9527") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading,
            isError = serverUrl.isBlank()
        )

        // Username
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text(i18n("config_username")) },
            placeholder = { Text("admin@example.com") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading,
            isError = username.isBlank()
        )

        // Password
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(i18n("config_password")) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading,
            isError = password.isBlank(),
            visualTransformation = if (showPassword) VisualTransformation.None
                else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        if (showPassword) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        )

        // Scan QR Code button
        OutlinedButton(
            onClick = onScanQr,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(i18n("config_scan_qr"))
        }

        // Login button
        Button(
            onClick = {
                if (serverUrl.isBlank()) {
                    Toast.makeText(context, i18n("config_err_server"), Toast.LENGTH_SHORT).show()
                    return@Button
                }
                if (username.isBlank() || password.isBlank()) {
                    Toast.makeText(context, i18n("settings_err_required"), Toast.LENGTH_SHORT).show()
                    return@Button
                }
                loginTrigger++
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(if (isLoading) i18n("config_connecting") else i18n("config_connect"))
        }
    }
}

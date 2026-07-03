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
import androidx.compose.ui.text.font.FontFamily
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
    var apiKey by remember { mutableStateOf(config.apiKey) }
    var clientName by remember { mutableStateOf(config.clientName) }
    var showApiKey by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(qrData) {
        if (qrData != null) {
            serverUrl = qrData.serverUrl
            apiKey = qrData.apiKey
            onQrDataConsumed()
        }
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

        // UUID display
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    i18n("config_uuid"),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = config.clientUuid,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

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

        // API Key
        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text(i18n("config_api_key")) },
            placeholder = { Text("nfkey_xxxxx") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading,
            isError = apiKey.isBlank(),
            visualTransformation = if (showApiKey) VisualTransformation.None
                else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showApiKey = !showApiKey }) {
                    Icon(
                        if (showApiKey) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        )

        // Device Name
        OutlinedTextField(
            value = clientName,
            onValueChange = { clientName = it },
            label = { Text(i18n("config_device_name")) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading
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

        // Connect button
        Button(
            onClick = {
                if (serverUrl.isBlank()) {
                    Toast.makeText(context, i18n("config_err_server"), Toast.LENGTH_SHORT).show()
                    return@Button
                }
                if (apiKey.isBlank()) {
                    Toast.makeText(context, i18n("config_err_apikey"), Toast.LENGTH_SHORT).show()
                    return@Button
                }
                isLoading = true
                val newConfig = ClientConfig(
                    serverUrl = serverUrl.trim(),
                    apiKey = apiKey.trim(),
                    clientUuid = config.clientUuid,
                    clientName = clientName.trim().ifBlank { android.os.Build.MODEL }
                )
                ConfigStore.save(context, newConfig)
                onSaved(newConfig)
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

package com.notifyhub.client.ui

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notifyhub.client.R
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.i18n
import kotlinx.coroutines.delay

private sealed class LoginResult {
    data class Success(val config: ClientConfig) : LoginResult()
    data class Error(val message: String) : LoginResult()
}

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
    var clientName by remember { mutableStateOf(config.clientName.ifBlank { android.os.Build.MODEL }) }
    var showPassword by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var showAdvanced by remember { mutableStateOf(config.serverUrl.isBlank()) }

    // Login animation - spinning logo
    val infiniteTransition = rememberInfiniteTransition(label = "login")
    val spinRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "spin"
    )

    // Track login result with minimum animation duration
    var loginResult by remember { mutableStateOf<LoginResult?>(null) }
    var loginStartTime by remember { mutableLongStateOf(0L) }

    // Process login result after minimum animation time
    LaunchedEffect(loginResult) {
        val result = loginResult ?: return@LaunchedEffect
        val elapsed = System.currentTimeMillis() - loginStartTime
        val remaining = 2000L - elapsed
        if (remaining > 0) delay(remaining)

        isLoading = false
        when (result) {
            is LoginResult.Success -> onSaved(result.config)
            is LoginResult.Error -> Toast.makeText(context, result.message, Toast.LENGTH_LONG).show()
        }
        loginResult = null
    }

    // QR auto-connect — uses ConnectHelper to avoid coroutine scope cancellation
    LaunchedEffect(qrData) {
        if (qrData?.jwt != null) {
            val qrServerUrl = qrData.serverUrl
            val qrJwt = qrData.jwt
            val deviceUuid = config.clientUuid
            val deviceName = clientName.ifBlank { android.os.Build.MODEL }

            isLoading = true
            loginStartTime = System.currentTimeMillis()
            onQrDataConsumed()

            ConnectHelper.connectWithJwt(
                context = context,
                serverUrl = qrServerUrl,
                jwt = qrJwt,
                clientUuid = deviceUuid,
                clientName = deviceName,
                onSuccess = { newConfig -> loginResult = LoginResult.Success(newConfig) },
                onError = { msg -> loginResult = LoginResult.Error(msg) }
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
        loginStartTime = System.currentTimeMillis()
        ConnectHelper.connectWithCredentials(
            context = context,
            serverUrl = serverUrl.trim(),
            username = username.trim(),
            password = password.trim(),
            clientUuid = config.clientUuid,
            clientName = clientName.ifBlank { android.os.Build.MODEL },
            onSuccess = { newConfig -> loginResult = LoginResult.Success(newConfig) },
            onError = { msg -> loginResult = LoginResult.Error(msg) }
        )
    }

    // Product logo bitmap
    val logoBitmap = remember {
        BitmapFactory.decodeResource(context.resources, R.drawable.logo)?.asImageBitmap()
    }

    if (isLoading) {
        // Loading state: static logo with spinning ring around it
        val ringColor = MaterialTheme.colorScheme.primary
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            // Spinning ring
            val ringSize = 96.dp
            Canvas(modifier = Modifier.size(ringSize)) {
                drawArc(
                    color = ringColor,
                    startAngle = spinRotation,
                    sweepAngle = 270f,
                    useCenter = false,
                    topLeft = Offset.Zero,
                    size = Size(ringSize.toPx(), ringSize.toPx()),
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                )
            }
            // Logo on top
            if (logoBitmap != null) {
                Image(
                    bitmap = logoBitmap,
                    contentDescription = "NotifyHub",
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                )
            }
        }
    } else {
        // Login form
        Box(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            contentAlignment = Alignment.TopCenter
        ) {
            Column(
                modifier = Modifier.widthIn(max = 400.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Spacer(Modifier.height(48.dp))

                // Product logo
                if (logoBitmap != null) {
                    Image(
                        bitmap = logoBitmap,
                        contentDescription = "NotifyHub",
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                    )
                }

                // App name
                Text(
                    text = i18n("app_name"),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )

                // Description
                Text(
                    text = i18n("config_desc"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                // Username
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text(i18n("config_username")) },
                    placeholder = { Text("admin@example.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = username.isBlank(),
                    shape = RoundedCornerShape(28.dp)
                )

                // Password
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(i18n("config_password")) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = password.isBlank(),
                    shape = RoundedCornerShape(28.dp),
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

                // Advanced Options toggle
                TextButton(
                    onClick = { showAdvanced = !showAdvanced },
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 0.dp, horizontal = 16.dp)
                ) {
                    Icon(
                        if (showAdvanced) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(i18n("compose_advanced"), fontSize = 12.sp)
                }

                // Advanced Options (collapsible)
                AnimatedVisibility(
                    visible = showAdvanced,
                    enter = expandVertically(),
                    exit = shrinkVertically()
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        // Server URL
                        OutlinedTextField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it },
                            label = { Text(i18n("config_server_url")) },
                            placeholder = { Text("http://192.168.x.x:9527") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            isError = serverUrl.isBlank(),
                            shape = RoundedCornerShape(28.dp)
                        )

                        // Device Name
                        OutlinedTextField(
                            value = clientName,
                            onValueChange = { clientName = it },
                            label = { Text(i18n("config_device_name")) },
                            placeholder = { Text(android.os.Build.MODEL) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(28.dp)
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                // Scan QR Code button
                OutlinedButton(
                    onClick = onScanQr,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(28.dp)
                ) {
                    Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(i18n("config_scan_qr"))
                }

                // Login button
                Button(
                    onClick = {
                        if (isLoading) return@Button
                        if (serverUrl.isBlank()) {
                            Toast.makeText(context, i18n("config_err_server"), Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
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
                    shape = RoundedCornerShape(28.dp)
                ) {
                    Text(i18n("config_connect"))
                }
            }
        }
    }
}

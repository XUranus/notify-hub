package com.notifyhub.client.ui

import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notifyhub.client.data.ApiClient
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.i18n
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "${bytes}B"
    bytes < 1048576 -> "%.1fKB".format(bytes / 1024.0)
    else -> "%.1fMB".format(bytes / 1048576.0)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ComposeScreen(
    config: ClientConfig,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    // Channel state
    var channel by remember { mutableStateOf("push") }
    val channels = listOf("push", "email", "sms")

    // To field
    var toValue by remember { mutableStateOf("") }
    var clients by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var clientsLoading by remember { mutableStateOf(false) }
    var clientsLoaded by remember { mutableStateOf(false) }

    // Other fields
    var subject by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    val tags = remember { mutableStateListOf<String>() }
    var tagInput by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var priority by remember { mutableIntStateOf(0) }
    var format by remember { mutableStateOf("text") }

    // Attachment state
    var attachmentName by remember { mutableStateOf("") }
    var attachmentUrl by remember { mutableStateOf("") }
    var isUploading by remember { mutableStateOf(false) }

    // Advanced toggle
    var advancedOpen by remember { mutableStateOf(false) }

    // Send state
    var isSending by remember { mutableStateOf(false) }
    var formatExpanded by remember { mutableStateOf(false) }
    var clientMenuExpanded by remember { mutableStateOf(false) }

    // Load clients when channel is push
    LaunchedEffect(channel) {
        if (channel == "push" && !clientsLoaded) {
            clientsLoading = true
            clients = withContext(Dispatchers.IO) {
                try { ApiClient(config.serverUrl, config.jwtToken).listClients() }
                catch (_: Exception) { emptyList() }
            }
            clientsLoading = false
            clientsLoaded = true
        }
        if (channel != "push") {
            toValue = ""
        }
    }

    // File picker launcher
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult

        scope.launch {
            isUploading = true
            val result = withContext(Dispatchers.IO) {
                try {
                    val api = ApiClient(config.serverUrl, config.jwtToken)

                    // Get file info
                    val cursor = context.contentResolver.query(uri, null, null, null, null)
                    var fileName = "upload.bin"
                    var fileSize = 0L
                    cursor?.use { c ->
                        c.moveToFirst()
                        val nameIndex = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = c.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex >= 0) fileName = c.getString(nameIndex)
                        if (sizeIndex >= 0) fileSize = c.getLong(sizeIndex)
                    }
                    val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"

                    // Check quota (skip for admin)
                    val quotaResult = api.getUploadQuota()
                    val quota = quotaResult.getOrThrow()

                    if (!quota.isAdmin) {
                        val maxSize = quota.maxFileSize
                        if (maxSize != null && fileSize > maxSize) {
                            return@withContext Result.failure<Map<String, Any?>>(
                                Exception(i18n("compose_err_file_too_large")
                                    .replace("{size}", formatBytes(fileSize))
                                    .replace("{max}", formatBytes(maxSize)))
                            )
                        }
                        val remaining = quota.remainingBytes
                        if (remaining != null && fileSize > remaining) {
                            return@withContext Result.failure<Map<String, Any?>>(
                                Exception(i18n("compose_err_no_storage")
                                    .replace("{remaining}", formatBytes(remaining))
                                    .replace("{size}", formatBytes(fileSize)))
                            )
                        }
                    }

                    // Upload
                    val inputStream = context.contentResolver.openInputStream(uri)
                        ?: return@withContext Result.failure<Map<String, Any?>>(Exception("Cannot open file"))
                    val uploadResult = inputStream.use { api.uploadFile(fileName, mimeType, it) }
                    uploadResult.map { data ->
                        mapOf(
                            "url" to data["url"],
                            "filename" to fileName,
                        )
                    }
                } catch (e: Exception) {
                    Result.failure(e)
                }
            }
            isUploading = false
            result.fold(
                onSuccess = { data ->
                    val url = data["url"]?.toString() ?: ""
                    val name = data["filename"]?.toString() ?: "file"
                    attachmentUrl = "${config.serverUrl.trimEnd('/')}$url"
                    attachmentName = name
                    Toast.makeText(context, i18n("compose_upload_success") + name, Toast.LENGTH_SHORT).show()
                },
                onFailure = { err ->
                    Toast.makeText(context, i18n("compose_upload_failed") + (err.message ?: ""), Toast.LENGTH_LONG).show()
                }
            )
        }
    }

    // Button press animation
    val sendInteraction = remember { MutableInteractionSource() }
    val sendPressed by sendInteraction.collectIsPressedAsState()
    val sendScale by animateFloatAsState(
        targetValue = if (sendPressed) 0.95f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessHigh),
        label = "sendScale"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(i18n("compose_title"), fontWeight = FontWeight.SemiBold) },
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
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            // ── Channel Badges ──
            Text(i18n("compose_channel"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                channels.forEach { ch ->
                    val isActive = ch == channel
                    val badgeScale by animateFloatAsState(
                        targetValue = if (isActive) 1f else 0.95f,
                        animationSpec = spring(stiffness = Spring.StiffnessMedium),
                        label = "badgeScale"
                    )
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (isActive) MaterialTheme.colorScheme.primary else Color.Transparent,
                        contentColor = if (isActive) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        border = if (!isActive) ButtonDefaults.outlinedButtonBorder(enabled = true) else null,
                        modifier = Modifier
                            .graphicsLayer {
                                scaleX = badgeScale
                                scaleY = badgeScale
                            }
                            .clickable(
                                indication = null,
                                interactionSource = remember { MutableInteractionSource() }
                            ) { channel = ch }
                    ) {
                        Text(
                            text = ch.replaceFirstChar { it.uppercase() },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            fontSize = 13.sp,
                            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── To field ──
            Text(i18n("compose_to"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))

            if (channel == "push") {
                Box {
                    OutlinedTextField(
                        value = toValue,
                        onValueChange = { toValue = it },
                        placeholder = { Text(i18n("compose_to_hint"), fontSize = 13.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        readOnly = true,
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = clientMenuExpanded)
                        }
                    )
                    DropdownMenu(
                        expanded = clientMenuExpanded,
                        onDismissRequest = { clientMenuExpanded = false },
                        modifier = Modifier.fillMaxWidth(0.9f)
                    ) {
                        DropdownMenuItem(
                            text = { Text(i18n("compose_to_push_all"), fontWeight = FontWeight.Medium) },
                            onClick = { toValue = "*"; clientMenuExpanded = false }
                        )
                        if (clientsLoading) {
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                        Spacer(Modifier.width(8.dp))
                                        Text(i18n("compose_loading_clients"), fontSize = 13.sp)
                                    }
                                },
                                onClick = {}
                            )
                        } else {
                            clients.forEach { client ->
                                val name = (client["deviceName"] as? String) ?: (client["name"] as? String) ?: "Unknown"
                                val uuid = (client["uuid"] as? String) ?: ""
                                val os = (client["deviceOs"] as? String) ?: (client["os"] as? String) ?: ""
                                val desktop = (client["desktop"] as? String) ?: ""
                                val connectionMode = (client["connectionMode"] as? String)
                                val lastSeenAt = (client["lastSeenAt"] as? Number)?.toLong()

                                // Determine online status (last seen within 5 minutes)
                                val isOnline = if (lastSeenAt != null) {
                                    val nowSeconds = System.currentTimeMillis() / 1000
                                    (nowSeconds - lastSeenAt) < 5 * 60
                                } else false

                                // OS icon
                                val osIcon = when {
                                    os.contains("android", ignoreCase = true) -> "🤖"
                                    os.contains("ios", ignoreCase = true) -> "🍎"
                                    os.contains("windows", ignoreCase = true) -> "🪟"
                                    os.contains("mac", ignoreCase = true) || os.contains("darwin", ignoreCase = true) -> "🍎"
                                    os.contains("linux", ignoreCase = true) -> "🐧"
                                    else -> "💻"
                                }

                                // OS display name
                                val osDisplay = when {
                                    os.contains("android", ignoreCase = true) -> "Android"
                                    os.contains("ios", ignoreCase = true) -> "iOS"
                                    os.contains("windows", ignoreCase = true) -> "Windows"
                                    os.contains("mac", ignoreCase = true) || os.contains("darwin", ignoreCase = true) -> "macOS"
                                    os.contains("linux", ignoreCase = true) -> "Linux"
                                    else -> os.replaceFirstChar { it.uppercase() }
                                }

                                DropdownMenuItem(
                                    text = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(osIcon, fontSize = 20.sp)
                                            Spacer(Modifier.width(8.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Text(name, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                                                    if (!isOnline) {
                                                        Spacer(Modifier.width(6.dp))
                                                        Text(i18n("compose_offline"),
                                                            fontSize = 11.sp,
                                                            color = MaterialTheme.colorScheme.error)
                                                    }
                                                }
                                                Text(buildString {
                                                    append(osDisplay)
                                                    if (desktop.isNotBlank() && desktop != osDisplay) {
                                                        append(" · $desktop")
                                                    }
                                                    if (connectionMode != null) {
                                                        append(" · ${connectionMode.uppercase()}")
                                                    }
                                                }, fontSize = 11.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                    },
                                    onClick = { toValue = uuid; clientMenuExpanded = false }
                                )
                            }
                        }
                    }
                    Box(
                        modifier = Modifier.matchParentSize().clickable { clientMenuExpanded = true }
                    )
                }
            } else {
                OutlinedTextField(
                    value = toValue,
                    onValueChange = { toValue = it },
                    placeholder = { Text(i18n("compose_to_hint"), fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            Spacer(Modifier.height(16.dp))

            // ── Subject ──
            Text(i18n("compose_subject"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = subject,
                onValueChange = { subject = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Spacer(Modifier.height(16.dp))

            // ── Body ──
            Text(i18n("compose_body"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = body,
                onValueChange = { body = it },
                modifier = Modifier.fillMaxWidth().height(120.dp),
                maxLines = 6,
            )

            Spacer(Modifier.height(16.dp))

            // ── Attachment (always visible, above Advanced) ──
            Text(i18n("compose_attachment"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(6.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = attachmentUrl,
                    onValueChange = { attachmentUrl = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text("https://example.com/file.pdf", fontSize = 13.sp) },
                )
                val uploadInteraction = remember { MutableInteractionSource() }
                val uploadPressed by uploadInteraction.collectIsPressedAsState()
                val uploadScale by animateFloatAsState(
                    targetValue = if (uploadPressed) 0.88f else 1f,
                    animationSpec = spring(stiffness = Spring.StiffnessHigh),
                    label = "uploadScale"
                )
                IconButton(
                    onClick = { filePickerLauncher.launch("*/*") },
                    enabled = !isUploading,
                    modifier = Modifier
                        .size(48.dp)
                        .graphicsLayer {
                            scaleX = uploadScale
                            scaleY = uploadScale
                        },
                    interactionSource = uploadInteraction,
                ) {
                    if (isUploading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp).rotate(0f),
                            strokeWidth = 2.5.dp,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    } else {
                        Icon(
                            Icons.Default.UploadFile,
                            contentDescription = i18n("compose_upload"),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
            // Show uploaded file name
            AnimatedVisibility(
                visible = attachmentName.isNotBlank(),
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Icon(Icons.Default.AttachFile, contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(4.dp))
                    Text(attachmentName, fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f))
                    IconButton(
                        onClick = { attachmentName = ""; attachmentUrl = "" },
                        modifier = Modifier.size(20.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(14.dp))
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── Advanced Toggle ──
            val arrowRotation by animateFloatAsState(
                targetValue = if (advancedOpen) 180f else 0f,
                animationSpec = tween(200),
                label = "arrowRotation"
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { advancedOpen = !advancedOpen }
                    .padding(vertical = 8.dp),
            ) {
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier
                        .size(18.dp)
                        .rotate(arrowRotation),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    i18n("compose_advanced"),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // ── Advanced Body (animated) ──
            AnimatedVisibility(
                visible = advancedOpen,
                enter = expandVertically(
                    animationSpec = spring(stiffness = Spring.StiffnessLow)
                ) + fadeIn(animationSpec = tween(200)),
                exit = shrinkVertically(
                    animationSpec = spring(stiffness = Spring.StiffnessLow)
                ) + fadeOut(animationSpec = tween(150)),
            ) {
                Column(modifier = Modifier.animateContentSize()) {
                    // ── Format ──
                    Text(i18n("compose_format"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(6.dp))
                    Box {
                        OutlinedTextField(
                            value = format,
                            onValueChange = {},
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            readOnly = true,
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = formatExpanded)
                            }
                        )
                        DropdownMenu(
                            expanded = formatExpanded,
                            onDismissRequest = { formatExpanded = false }
                        ) {
                            listOf("text", "markdown", "html", "json").forEach { f ->
                                DropdownMenuItem(
                                    text = { Text(f, fontWeight = if (f == format) FontWeight.Bold else FontWeight.Normal) },
                                    onClick = { format = f; formatExpanded = false }
                                )
                            }
                        }
                        Box(
                            modifier = Modifier.matchParentSize().clickable { formatExpanded = true }
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    // ── Priority ──
                    Text(i18n("compose_priority"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = priority.toString(),
                        onValueChange = { priority = it.toIntOrNull() ?: 0 },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )

                    Spacer(Modifier.height(16.dp))

                    // ── URL ──
                    Text(i18n("compose_url"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = url,
                        onValueChange = { url = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("https://example.com", fontSize = 13.sp) },
                    )

                    Spacer(Modifier.height(16.dp))

                    // ── Tags ──
                    Text(i18n("compose_tags"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(6.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        tags.forEachIndexed { index, tag ->
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = MaterialTheme.colorScheme.secondaryContainer,
                                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)
                                ) {
                                    Text(tag, fontSize = 12.sp)
                                    Spacer(Modifier.width(2.dp))
                                    IconButton(onClick = { tags.removeAt(index) }, modifier = Modifier.size(18.dp)) {
                                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(12.dp))
                                    }
                                }
                            }
                        }
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            OutlinedTextField(
                                value = tagInput,
                                onValueChange = { tagInput = it },
                                placeholder = { Text(i18n("compose_tags_hint"), fontSize = 12.sp) },
                                modifier = Modifier.width(140.dp).height(32.dp),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodySmall,
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = {
                                    val trimmed = tagInput.trim()
                                    if (trimmed.isNotEmpty()) {
                                        tags.add(trimmed)
                                        tagInput = ""
                                    }
                                    focusManager.clearFocus()
                                }),
                                colors = androidx.compose.material3.TextFieldDefaults.colors(
                                    focusedIndicatorColor = Color.Transparent,
                                    unfocusedIndicatorColor = Color.Transparent,
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                )
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                }
            }

            Spacer(Modifier.height(24.dp))

            // ── Send Button ──
            Button(
                onClick = {
                    if (toValue.isBlank()) {
                        Toast.makeText(context, i18n("compose_err_to"), Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    if (subject.isBlank() && body.isBlank()) {
                        Toast.makeText(context, i18n("compose_err_body"), Toast.LENGTH_SHORT).show()
                        return@Button
                    }

                    isSending = true
                    scope.launch {
                        val result = withContext(Dispatchers.IO) {
                            ApiClient(config.serverUrl, config.jwtToken).send(
                                channel = channel,
                                to = toValue,
                                subject = subject.ifBlank { null },
                                body = body.ifBlank { null },
                                tags = tags.toList().ifEmpty { null },
                                priority = if (priority > 0) priority else null,
                                url = url.ifBlank { null },
                                format = if (format != "text") format else null,
                                attachmentName = attachmentName.ifBlank { attachmentUrl.split("/").lastOrNull() },
                                attachmentUrl = attachmentUrl.ifBlank { null },
                            )
                        }
                        isSending = false
                        result.fold(
                            onSuccess = {
                                Toast.makeText(context, i18n("compose_sent"), Toast.LENGTH_SHORT).show()
                                onBack()
                            },
                            onFailure = { err ->
                                Toast.makeText(context, err.message ?: "Send failed", Toast.LENGTH_LONG).show()
                            }
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .graphicsLayer {
                        scaleX = sendScale
                        scaleY = sendScale
                    },
                enabled = !isSending && !isUploading,
                shape = RoundedCornerShape(12.dp),
                interactionSource = sendInteraction,
            ) {
                if (isSending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(i18n("compose_sending"))
                } else {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(i18n("compose_send"), fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

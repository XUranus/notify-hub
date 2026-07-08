package com.notifyhub.client.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.LocalMessage
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.layout.ContentScale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun MessageDetailScreen(
    msg: LocalMessage,
    onBack: () -> Unit,
    onDownload: (String, String) -> Unit // (url, filename) -> Unit
) {
    val context = LocalContext.current
    var showSaveImageSheet by remember { mutableStateOf(false) }
    var pendingSavePath by remember { mutableStateOf<String?>(null) }

    // Save image bottom sheet
    if (showSaveImageSheet) {
        ModalBottomSheet(onDismissRequest = { showSaveImageSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 32.dp)
            ) {
                Text(
                    text = I18n["save_to_local"],
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            showSaveImageSheet = false
                            val path = pendingSavePath ?: return@clickable
                            try {
                                val bitmap = BitmapFactory.decodeFile(path)
                                if (bitmap != null) {
                                    val fileName = "notifyhub_${System.currentTimeMillis()}.png"
                                    val contentValues = ContentValues().apply {
                                        put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                                        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                                        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/NotifyHub")
                                    }
                                    val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                                    if (uri != null) {
                                        context.contentResolver.openOutputStream(uri)?.use { out ->
                                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                                        }
                                        Toast.makeText(context, I18n["image_saved"], Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    Toast.makeText(context, I18n["save_failed"], Toast.LENGTH_SHORT).show()
                                }
                            } catch (_: Exception) {
                                Toast.makeText(context, I18n["save_failed"], Toast.LENGTH_SHORT).show()
                            }
                        }
                        .padding(vertical = 16.dp),
                    textAlign = TextAlign.Center,
                    fontSize = 16.sp
                )
                HorizontalDivider()
                Text(
                    text = I18n["cancel"],
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showSaveImageSheet = false }
                        .padding(vertical = 16.dp),
                    textAlign = TextAlign.Center,
                    fontSize = 16.sp
                )
            }
        }
    }

    // Handle back gesture/button
    BackHandler(onBack = onBack)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n["msg_detail"], maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Title with avatar and copy button
            val hasTitle = msg.title.isNotBlank()
            val displayTitle = if (hasTitle) msg.title else I18n["untitled"]
            val levelColor = when (msg.level.uppercase()) {
                "ERROR" -> MaterialTheme.colorScheme.error
                "WARN", "WARNING" -> Color(0xFFF59E0B)
                "DEBUG" -> MaterialTheme.colorScheme.tertiary
                else -> MaterialTheme.colorScheme.primary
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                // Avatar
                TopicAvatar(
                    topicIcon = msg.topicIcon,
                    topicName = msg.topicName,
                    topicDisplayName = msg.topicDisplayName,
                    size = 36,
                    borderColor = levelColor,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = displayTitle,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (hasTitle) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                // Copy title button (only if has title)
                if (hasTitle) {
                    IconButton(
                        onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = ClipData.newPlainText("title", msg.title)
                            clipboard.setPrimaryClip(clip)
                            Toast.makeText(context, I18n["copied"], Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            Icons.Default.ContentCopy,
                            contentDescription = I18n["copy_title"],
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            // Meta info row
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Timestamp
                Text(
                    text = msg.receivedAt,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                // Level badge
                val levelColor = when (msg.level.uppercase()) {
                    "ERROR" -> MaterialTheme.colorScheme.error
                    "WARN", "WARNING" -> MaterialTheme.colorScheme.tertiary
                    else -> MaterialTheme.colorScheme.primary
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = levelColor.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = msg.level.uppercase(),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = levelColor,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                    )
                }
            }

            // URL button
            if (!msg.url.isNullOrEmpty()) {
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(msg.url)))
                        } catch (_: Exception) {
                            Toast.makeText(context, "Invalid URL", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        Icons.Default.OpenInBrowser,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = msg.url,
                        maxLines = 1,
                        fontSize = 13.sp
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Body content card
            val format = msg.format ?: "text"
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                )
            ) {
                Column {
                    Box(modifier = Modifier.padding(12.dp)) {
                        when (format) {
                            "markdown" -> MarkdownText(msg.body)
                            "html" -> HtmlText(msg.body)
                            "json" -> JsonText(msg.body)
                            else -> Text(
                                text = msg.body,
                                fontSize = 14.sp,
                                lineHeight = 22.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                    // Copy body button at bottom-right of card
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(end = 4.dp, bottom = 2.dp),
                        contentAlignment = Alignment.CenterEnd
                    ) {
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                val clip = ClipData.newPlainText("message", msg.body)
                                clipboard.setPrimaryClip(clip)
                                Toast.makeText(context, I18n["copied"], Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = I18n["copy"],
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }

            // Tags
            val parsedTags: List<String> = remember(msg.tags) {
                try {
                    if (msg.tags != null && msg.tags != "[]") {
                        Gson().fromJson(msg.tags, object : TypeToken<List<String>>() {}.type)
                    } else emptyList()
                } catch (_: Exception) { emptyList() }
            }
            if (parsedTags.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Text(
                    text = I18n["tags"],
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    parsedTags.forEach { tag ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            border = androidx.compose.foundation.BorderStroke(
                                0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
                            )
                        ) {
                            Text(
                                text = tag,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            )
                        }
                    }
                }
            }

            // Attachment
            if (msg.attachment != null) {
                Spacer(Modifier.height(14.dp))
                Text(
                    text = I18n["attachment"],
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                val attachmentInfo = remember(msg.attachment) {
                    try {
                        val att = Gson().fromJson(msg.attachment, Map::class.java) as? Map<*, *>
                        att
                    } catch (_: Exception) { null }
                }
                if (attachmentInfo != null) {
                    val name = attachmentInfo["name"] as? String ?: "attachment"
                    val url = attachmentInfo["url"] as? String
                    val data = attachmentInfo["data"] as? String
                    val size = attachmentInfo["size"] as? Number
                    val sizeStr = if (size != null) {
                        val bytes = size.toLong()
                        when {
                            bytes >= 1_048_576 -> "${bytes / 1_048_576} MB"
                            bytes >= 1024 -> "${bytes / 1024} KB"
                            else -> "$bytes B"
                        }
                    } else ""

                    // Show local image preview if available
                    val localPath = msg.localImagePath
                    val isImage = localPath != null && localPath.lowercase().let {
                        it.endsWith(".png") || it.endsWith(".jpg") || it.endsWith(".jpeg") ||
                        it.endsWith(".gif") || it.endsWith(".webp") || it.endsWith(".bmp")
                    }
                    if (isImage && localPath != null) {
                        val file = File(localPath)
                        if (file.exists()) {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .combinedClickable(
                                        onClick = {},
                                        onLongClick = {
                                            pendingSavePath = localPath
                                            showSaveImageSheet = true
                                        }
                                    ),
                                shape = RoundedCornerShape(8.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                                )
                            ) {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data(file)
                                        .crossfade(true)
                                        .build(),
                                    contentDescription = name,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 400.dp),
                                    contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                                )
                            }
                        }
                    }

                    OutlinedCard(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            if (url != null) {
                                onDownload(url, name)
                            } else if (data != null) {
                                Toast.makeText(context, I18n["attachment_no_url"], Toast.LENGTH_SHORT).show()
                            }
                        }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Download,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = name,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (sizeStr.isNotEmpty()) {
                                    Text(
                                        text = sizeStr,
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            if (url != null) {
                                Text(
                                    text = I18n["download"],
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun HtmlText(body: String) {
    val spanned = remember(body) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                android.text.Html.fromHtml(body, android.text.Html.FROM_HTML_MODE_COMPACT)
            } else {
                @Suppress("DEPRECATION")
                android.text.Html.fromHtml(body)
            }
        } catch (_: Exception) {
            null
        }
    }

    if (spanned != null) {
        Text(
            text = spanned.toString(),
            fontSize = 14.sp,
            lineHeight = 22.sp,
            color = MaterialTheme.colorScheme.onSurface
        )
    } else {
        Text(
            text = body,
            fontSize = 14.sp,
            lineHeight = 22.sp,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun JsonText(body: String) {
    val context = LocalContext.current
    val highlighted = remember(body) {
        try {
            val parser = com.google.gson.JsonParser()
            val element = parser.parse(body)
            val formatted = Gson().newBuilder().setPrettyPrinting().create().toJson(element)
            highlightJson(formatted)
        } catch (_: Exception) {
            null
        }
    }

    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
    ) {
        if (highlighted != null) {
            Text(
                text = highlighted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.padding(10.dp)
            )
        } else {
            Text(
                text = body,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(10.dp)
            )
        }
    }
}

private fun highlightJson(json: String): androidx.compose.ui.text.AnnotatedString {
    val builder = androidx.compose.ui.text.AnnotatedString.Builder()
    val keyColor = androidx.compose.ui.graphics.Color(0xFF7C3AED)      // purple for keys
    val stringColor = androidx.compose.ui.graphics.Color(0xFF059669)   // green for strings
    val numberColor = androidx.compose.ui.graphics.Color(0xFFD97706)   // amber for numbers
    val booleanColor = androidx.compose.ui.graphics.Color(0xFF2563EB)  // blue for booleans
    val nullColor = androidx.compose.ui.graphics.Color(0xFF9CA3AF)     // gray for null
    val bracketColor = androidx.compose.ui.graphics.Color(0xFF6B7280)  // gray for brackets
    val colonColor = androidx.compose.ui.graphics.Color(0xFF374151)    // dark gray for colons

    var i = 0
    while (i < json.length) {
        when {
            // Key (quoted string followed by colon)
            json[i] == '"' && i + 1 < json.length -> {
                val endQuote = findEndQuote(json, i + 1)
                if (endQuote != -1) {
                    val key = json.substring(i, endQuote + 1)
                    // Check if this is a key (followed by colon)
                    val afterQuote = json.substring(endQuote + 1).trimStart()
                    if (afterQuote.startsWith(":")) {
                        builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = keyColor))
                        builder.append(key)
                        builder.pop()
                    } else {
                        builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = stringColor))
                        builder.append(key)
                        builder.pop()
                    }
                    i = endQuote + 1
                } else {
                    builder.append(json[i])
                    i++
                }
            }
            // Numbers
            json[i].isDigit() || (json[i] == '-' && i + 1 < json.length && json[i + 1].isDigit()) -> {
                val start = i
                if (json[i] == '-') i++
                while (i < json.length && (json[i].isDigit() || json[i] == '.' || json[i] == 'e' || json[i] == 'E' || json[i] == '+' || json[i] == '-')) {
                    i++
                }
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = numberColor))
                builder.append(json.substring(start, i))
                builder.pop()
            }
            // Boolean true
            json.substring(i).startsWith("true") -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = booleanColor))
                builder.append("true")
                builder.pop()
                i += 4
            }
            // Boolean false
            json.substring(i).startsWith("false") -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = booleanColor))
                builder.append("false")
                builder.pop()
                i += 5
            }
            // Null
            json.substring(i).startsWith("null") -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = nullColor))
                builder.append("null")
                builder.pop()
                i += 4
            }
            // Brackets and braces
            json[i] == '{' || json[i] == '}' || json[i] == '[' || json[i] == ']' -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = bracketColor, fontWeight = FontWeight.Bold))
                builder.append(json[i])
                builder.pop()
                i++
            }
            // Colon
            json[i] == ':' -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = colonColor))
                builder.append(": ")
                builder.pop()
                i++
                // Skip optional space after colon
                if (i < json.length && json[i] == ' ') i++
            }
            // Comma
            json[i] == ',' -> {
                builder.pushStyle(androidx.compose.ui.text.SpanStyle(color = bracketColor))
                builder.append(",")
                builder.pop()
                i++
            }
            // Other characters (whitespace, etc.)
            else -> {
                builder.append(json[i])
                i++
            }
        }
    }
    return builder.toAnnotatedString()
}

private fun findEndQuote(str: String, start: Int): Int {
    var i = start
    while (i < str.length) {
        if (str[i] == '\\') {
            i += 2 // skip escaped character
        } else if (str[i] == '"') {
            return i
        } else {
            i++
        }
    }
    return -1
}

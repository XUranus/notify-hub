package com.notifyhub.client.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest

@Composable
fun TopicAvatar(
    topicIcon: String?,
    topicName: String?,
    topicDisplayName: String?,
    size: Int = 40,
    borderColor: Color = MaterialTheme.colorScheme.primary,
) {
    val label = topicDisplayName ?: topicName
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(borderColor.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center
    ) {
        when {
            !topicIcon.isNullOrEmpty() -> {
                if (topicIcon.startsWith("data:")) {
                    val bitmap = remember(topicIcon) {
                        try {
                            val base64 = topicIcon.substringAfter(",")
                            val bytes = Base64.decode(base64, Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                        } catch (_: Exception) { null }
                    }
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                    }
                } else {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current).data(topicIcon).crossfade(true).build(),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                }
            }
            !label.isNullOrEmpty() -> {
                val initials = if (label.length <= 2) label else label.substring(0, 2)
                Text(initials, fontSize = (size * 0.35).sp, fontWeight = FontWeight.Bold, color = borderColor)
            }
            else -> {
                Icon(
                    Icons.Default.Notifications,
                    contentDescription = null,
                    modifier = Modifier.size((size * 0.5).dp),
                    tint = borderColor.copy(alpha = 0.6f)
                )
            }
        }
    }
}

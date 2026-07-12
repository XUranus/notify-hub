package com.notifyhub.client.ui

import androidx.compose.ui.unit.dp
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.LocalMessage

// ── Constants ──
const val TOPIC_PREVIEW_MAX_CHARS = 200
val TOPIC_CARD_VERTICAL_PADDING = 14.dp

// ── Topic Grouping ──
data class TopicGroup(
    val key: String,
    val topicId: String?,
    val topicName: String?,
    val topicDisplayName: String?,
    val topicDescription: String?,
    val topicIcon: String?,
    val messages: List<LocalMessage>,
)

fun groupByTopic(messages: List<LocalMessage>): List<TopicGroup> {
    val groups = mutableMapOf<String, MutableList<LocalMessage>>()
    for (m in messages) {
        val key = m.topicId ?: "__no_topic__"
        groups.getOrPut(key) { mutableListOf() }.add(m)
    }
    return groups.entries.map { (key, msgs) ->
        val first = msgs.first()
        TopicGroup(
            key = key,
            topicId = first.topicId,
            topicName = first.topicName,
            topicDisplayName = first.topicDisplayName,
            topicDescription = first.topicDescription,
            topicIcon = first.topicIcon,
            messages = msgs.sortedByDescending { it.receivedAt },
        )
    }.sortedWith(compareByDescending<TopicGroup> { it.topicId != null }.thenByDescending { it.messages.firstOrNull()?.receivedAt ?: "" })
}

fun formatRelativeTime(dateStr: String): String {
    return try {
        val date = try {
            // ISO 8601 with 'Z' (UTC) — parse as UTC then display in local time
            val utcFmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault()).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }
            utcFmt.parse(dateStr.take(19))
        } catch (_: Exception) {
            java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).parse(dateStr)
        } ?: return dateStr
        val now = System.currentTimeMillis()
        val diff = now - date.time

        when {
            diff < 60_000 -> I18n["time_just_now"]
            diff < 3_600_000 -> "${(diff / 60_000).toInt()} ${I18n["time_minutes_ago"]}"
            diff < 86_400_000 -> "${(diff / 3_600_000).toInt()} ${I18n["time_hours_ago"]}"
            diff < 2_592_000_000 -> "${(diff / 86_400_000).toInt()} ${I18n["time_days_ago"]}"
            else -> {
                val outFmt = java.text.SimpleDateFormat("MM/dd", java.util.Locale.getDefault())
                outFmt.format(date)
            }
        }
    } catch (_: Exception) {
        dateStr
    }
}

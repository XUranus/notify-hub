package com.notifyhub.client.ui

import androidx.compose.ui.unit.dp
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
    try {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault())
        val date = fmt.parse(dateStr) ?: return dateStr
        val diff = System.currentTimeMillis() - date.time
        if (diff < 60_000) return I18n["just_now"]
        if (diff < 3600_000) return "${diff / 60_000} ${I18n["min_ago"]}"
        if (diff < 86400_000) return "${diff / 3600_000} ${I18n["hr_ago"]}"
        if (diff < 2592000_000) return "${diff / 86400_000} ${I18n["days_ago"]}"
        val cal = java.util.Calendar.getInstance().apply { time = date }
        return "${cal.get(java.util.Calendar.MONTH) + 1}/${cal.get(java.util.Calendar.DAY_OF_MONTH)}"
    } catch (_: Exception) {
        return dateStr
    }
}

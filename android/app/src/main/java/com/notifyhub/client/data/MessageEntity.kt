package com.notifyhub.client.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "messages",
    indices = [
        Index("received_at"),
        Index("is_read"),
        Index("flagged"),
        Index("topic_id"),
    ]
)
data class MessageEntity(
    @PrimaryKey val id: String,
    val title: String = "",
    val body: String = "",
    val level: String = "INFO",
    @ColumnInfo(name = "received_at") val receivedAt: String = "",
    @ColumnInfo(name = "is_read") val isRead: Boolean = false,
    val flagged: Boolean = false,
    val tags: String? = null,
    val priority: Int = 0,
    val url: String? = null,
    val attachment: String? = null,
    val format: String? = null,
    @ColumnInfo(name = "local_image_path") val localImagePath: String? = null,
    // Topic fields
    @ColumnInfo(name = "topic_id") val topicId: String? = null,
    @ColumnInfo(name = "topic_name") val topicName: String? = null,
    @ColumnInfo(name = "topic_display_name") val topicDisplayName: String? = null,
    @ColumnInfo(name = "topic_description") val topicDescription: String? = null,
    @ColumnInfo(name = "topic_icon") val topicIcon: String? = null,
)

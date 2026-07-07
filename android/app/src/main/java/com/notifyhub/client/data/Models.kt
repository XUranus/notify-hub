package com.notifyhub.client.data

enum class MessageFilter { ALL, UNREAD, READ, FLAGGED }

data class PushMessage(
    val id: String,
    val clientUuid: String?,
    val title: String,
    val body: String,
    val level: String,
    val delivered: Boolean,
    val createdAt: String?,
    // Extended fields
    val tags: String? = null,
    val priority: Int = 0,
    val url: String? = null,
    val attachment: String? = null,
    val format: String? = null,
    // Topic fields
    val topicId: String? = null,
    val topicName: String? = null,
    val topicDisplayName: String? = null,
    val topicIcon: String? = null,
)

data class ApiResponse<T>(
    val success: Boolean,
    val data: T?
)

data class LocalMessage(
    val id: String,
    val title: String,
    val body: String,
    val level: String,
    val receivedAt: String,
    val read: Boolean = false,
    val flagged: Boolean = false,
    val tags: String? = null,
    val priority: Int = 0,
    val url: String? = null,
    val attachment: String? = null,
    val format: String? = null,
    val localImagePath: String? = null,
    // Topic fields
    val topicId: String? = null,
    val topicName: String? = null,
    val topicDisplayName: String? = null,
    val topicIcon: String? = null,
)

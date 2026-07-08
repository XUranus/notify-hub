package com.notifyhub.client.service

fun truncateForNotification(text: String, maxLength: Int = 100): String {
    return if (text.length > maxLength) {
        text.take(maxLength - 3) + "..."
    } else {
        text
    }
}

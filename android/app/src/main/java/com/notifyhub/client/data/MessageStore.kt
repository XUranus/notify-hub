package com.notifyhub.client.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import androidx.room.withTransaction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

object MessageStore {

    private const val TAG = "MessageStore"
    private const val PREF_NAME = "messages"
    private const val KEY_LIST = "list"
    private const val MAX_MESSAGES = 15000

    private val gson = Gson()

    // ── Conversion helpers ──────────────────────────────────────────────────

    /** Normalize ISO 8601 or other time formats to local "yyyy-MM-dd HH:mm:ss" */
    fun normalizeTimeFormat(dateStr: String): String {
        return try {
            val date = try {
                // ISO 8601 with 'Z' (UTC) — e.g. "2026-07-05T13:59:22.658Z"
                val utcFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }
                utcFmt.parse(dateStr.take(19))
            } catch (_: Exception) {
                try {
                    // Already local format
                    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).parse(dateStr)
                } catch (_: Exception) {
                    null
                }
            } ?: return dateStr
            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(date)
        } catch (_: Exception) {
            AppLogger.w("MessageStore", "Date parse failed for: $dateStr")
            dateStr
        }
    }

    fun PushMessage.toEntity(): MessageEntity = MessageEntity(
        id = id,
        title = title ?: "",
        body = body,
        level = level ?: "INFO",
        receivedAt = createdAt?.let { normalizeTimeFormat(it) } ?: SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(System.currentTimeMillis()),
        isRead = false,
        flagged = false,
        tags = tags,
        priority = priority,
        url = url,
        attachment = attachment,
        format = format,
        topicId = topicId,
        topicName = topicName,
        topicDisplayName = topicDisplayName,
        topicDescription = topicDescription,
        topicIcon = topicIcon,
    )

    fun MessageEntity.toLocal(): LocalMessage = LocalMessage(
        id = id,
        title = title,
        body = body,
        level = level,
        receivedAt = receivedAt,
        read = isRead,
        flagged = flagged,
        tags = tags,
        priority = priority,
        url = url,
        attachment = attachment,
        format = format,
        localImagePath = localImagePath,
        topicId = topicId,
        topicName = topicName,
        topicDisplayName = topicDisplayName,
        topicDescription = topicDescription,
        topicIcon = topicIcon,
    )

    fun LocalMessage.toEntity(): MessageEntity = MessageEntity(
        id = id,
        title = title,
        body = body,
        level = level,
        receivedAt = receivedAt,
        isRead = read,
        flagged = flagged,
        tags = tags,
        priority = priority,
        url = url,
        attachment = attachment,
        format = format,
        localImagePath = localImagePath,
        topicId = topicId,
        topicName = topicName,
        topicDisplayName = topicDisplayName,
        topicDescription = topicDescription,
        topicIcon = topicIcon,
    )

    // ── Initialization / Migration ──────────────────────────────────────────

    private var migrated = false

    private fun ensureMigrated(context: Context) {
        if (migrated) return
        migrated = true
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(KEY_LIST, null) ?: return
        if (json == "[]") {
            prefs.edit().clear().apply()
            return
        }
        try {
            val type = object : TypeToken<List<LocalMessage>>() {}.type
            val old: List<LocalMessage> = gson.fromJson(json, type)
            if (old.isEmpty()) {
                prefs.edit().clear().apply()
                return
            }
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val dao = AppDatabase.getInstance(context).messageDao()
                    val entities = old.map { it.toEntity() }
                    dao.insertAll(entities)
                    prefs.edit().clear().apply()
                    AppLogger.i(TAG, "Migrated ${entities.size} messages from SharedPreferences to Room")
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Migration failed", e)
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Migration parse failed", e)
        }
    }

    // ── Reactive queries (Flow) ─────────────────────────────────────────────

    fun getAllFlow(context: Context): Flow<List<LocalMessage>> {
        ensureMigrated(context)
        return AppDatabase.getInstance(context).messageDao().getAllFlow()
            .debounce(100)
            .map { list -> list.map { it.toLocal() } }
            .flowOn(Dispatchers.IO)
    }

    fun getFilteredFlow(
        context: Context,
        filter: MessageFilter,
        searchQuery: String = "",
    ): Flow<List<LocalMessage>> {
        ensureMigrated(context)
        val dao = AppDatabase.getInstance(context).messageDao()
        val baseFlow: Flow<List<MessageEntity>> = when {
            searchQuery.isNotBlank() -> dao.searchFlow(searchQuery)
            filter == MessageFilter.UNREAD -> dao.getUnreadFlow()
            filter == MessageFilter.READ -> dao.getReadFlow()
            filter == MessageFilter.FLAGGED -> dao.getFlaggedFlow()
            else -> dao.getAllFlow()
        }
        return baseFlow
            .debounce(100)
            .map { list ->
                list
                    .filter { entity ->
                        when (filter) {
                            MessageFilter.ALL -> true
                            MessageFilter.UNREAD -> !entity.isRead
                            MessageFilter.READ -> entity.isRead
                            MessageFilter.FLAGGED -> entity.flagged
                        }
                    }
                    .map { it.toLocal() }
            }
            .flowOn(Dispatchers.IO)
    }

    fun getUnreadCountFlow(context: Context): Flow<Int> {
        ensureMigrated(context)
        return AppDatabase.getInstance(context).messageDao().getUnreadCountFlow()
            .debounce(100)
    }

    suspend fun getById(context: Context, id: String): LocalMessage? {
        ensureMigrated(context)
        return AppDatabase.getInstance(context).messageDao().getById(id)?.toLocal()
    }

    // ── Write operations (suspend) ──────────────────────────────────────────

    /**
     * Save messages, filtering out duplicates that already exist in the local database.
     * Returns only the newly inserted (non-duplicate) messages.
     */
    suspend fun save(context: Context, messages: List<PushMessage>): List<PushMessage> {
        ensureMigrated(context)
        val dao = AppDatabase.getInstance(context).messageDao()
        if (messages.isEmpty()) return emptyList()

        val incomingIds = messages.map { it.id }
        val existingIds = dao.getExistingIds(incomingIds).toSet()
        val newMessages = messages.filter { it.id !in existingIds }

        if (newMessages.isEmpty()) {
            for (msg in messages) {
                AppLogger.w(TAG, "Duplicate message ignored: id=${msg.id}")
            }
            return emptyList()
        }

        for (msg in messages) {
            if (msg.id in existingIds) {
                AppLogger.w(TAG, "Duplicate message ignored: id=${msg.id}")
            }
        }

        val entities = newMessages.map { it.toEntity() }
        dao.insertAll(entities)
        AppLogger.i(TAG, "Stored ${newMessages.size} new messages (${messages.size - newMessages.size} duplicates)")
        trimExcess(context)
        return newMessages
    }

    private suspend fun trimExcess(context: Context) {
        val dao = AppDatabase.getInstance(context).messageDao()
        val latest = dao.getLatestReceivedAt() ?: return
        AppLogger.d(TAG, "trimExcess: no-op (handled by ${MAX_MESSAGES} cap in DAO)")
    }

    suspend fun markAsRead(context: Context, id: String) {
        AppDatabase.getInstance(context).messageDao().markAsRead(id)
    }

    suspend fun markAllAsRead(context: Context, topicId: String? = null) {
        val dao = AppDatabase.getInstance(context).messageDao()
        if (topicId != null) dao.markTopicAsRead(topicId) else dao.markAllAsRead()
    }

    suspend fun toggleFlag(context: Context, id: String) {
        val db = AppDatabase.getInstance(context)
        db.withTransaction {
            val dao = db.messageDao()
            val entity = dao.getById(id)
            if (entity == null) {
                AppLogger.w(TAG, "toggleFlag: message $id not found")
                return@withTransaction
            }
            dao.setFlagged(id, !entity.flagged)
        }
    }

    suspend fun delete(context: Context, id: String): LocalMessage? {
        val db = AppDatabase.getInstance(context)
        return db.withTransaction {
            val dao = db.messageDao()
            val entity = dao.getById(id)
            if (entity == null) {
                AppLogger.w(TAG, "delete: message $id not found")
                return@withTransaction null
            }
            dao.deleteById(id)
            entity.toLocal()
        }
    }

    suspend fun insert(context: Context, message: LocalMessage, index: Int = 0) {
        AppDatabase.getInstance(context).messageDao().insert(message.toEntity())
    }

    suspend fun deleteByIds(context: Context, ids: List<String>) {
        if (ids.isEmpty()) return
        AppDatabase.getInstance(context).messageDao().deleteByIds(ids)
    }

    suspend fun deleteAll(context: Context) {
        AppDatabase.getInstance(context).messageDao().deleteAll()
        AppLogger.i(TAG, "Deleted all messages")
    }

    suspend fun cleanOldMessages(context: Context, days: Int): Int {
        if (days <= 0) return 0
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -days)
        val cutoff = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(cal.time)
        val count = AppDatabase.getInstance(context).messageDao().deleteOlderThan(cutoff)
        AppLogger.i(TAG, "Cleaned $count messages older than $days days")
        return count
    }
}

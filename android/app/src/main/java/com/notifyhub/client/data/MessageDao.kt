package com.notifyhub.client.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    @Query("SELECT * FROM messages ORDER BY received_at DESC")
    fun getAllFlow(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE is_read = 0 ORDER BY received_at DESC")
    fun getUnreadFlow(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE is_read = 1 ORDER BY received_at DESC")
    fun getReadFlow(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE flagged = 1 ORDER BY received_at DESC")
    fun getFlaggedFlow(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE (title LIKE '%' || :query || '%' OR body LIKE '%' || :query || '%') ORDER BY received_at DESC")
    fun searchFlow(query: String): Flow<List<MessageEntity>>

    @Query("SELECT COUNT(*) FROM messages WHERE is_read = 0")
    fun getUnreadCountFlow(): Flow<Int>

    @Query("UPDATE messages SET is_read = 1 WHERE id = :id")
    suspend fun markAsRead(id: String)

    @Query("UPDATE messages SET is_read = 1 WHERE is_read = 0")
    suspend fun markAllAsRead()

    @Query("UPDATE messages SET is_read = 1 WHERE is_read = 0 AND (topic_id = :topicId OR (topic_id IS NULL AND :topicId = '__no_topic__'))")
    suspend fun markTopicAsRead(topicId: String)

    @Query("UPDATE messages SET flagged = :flagged WHERE id = :id")
    suspend fun setFlagged(id: String, flagged: Boolean)

    @Query("DELETE FROM messages WHERE id = :id")
    suspend fun deleteById(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<MessageEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE received_at < :cutoffDate")
    suspend fun deleteOlderThan(cutoffDate: String): Int

    @Query("SELECT * FROM messages WHERE id = :id")
    suspend fun getById(id: String): MessageEntity?

    @Query("SELECT id FROM messages WHERE id IN (:ids)")
    suspend fun getExistingIds(ids: List<String>): List<String>

    @Query("SELECT MAX(received_at) FROM messages")
    suspend fun getLatestReceivedAt(): String?

    @Query("DELETE FROM messages")
    suspend fun deleteAll()

    @Query("UPDATE messages SET local_image_path = :path WHERE id = :id")
    suspend fun setLocalImagePath(id: String, path: String)
}

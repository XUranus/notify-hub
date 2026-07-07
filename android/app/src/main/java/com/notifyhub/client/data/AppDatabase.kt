package com.notifyhub.client.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [MessageEntity::class], version = 3, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun messageDao(): MessageDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE messages ADD COLUMN local_image_path TEXT")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE messages ADD COLUMN topic_id TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN topic_name TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN topic_display_name TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN topic_icon TEXT")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_messages_topic_id ON messages (topic_id)")
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "notifyhub.db"
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                 .build().also { INSTANCE = it }
            }
        }
    }
}

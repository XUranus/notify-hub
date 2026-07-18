package com.notifyhub.client.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.InputStream
import java.util.concurrent.TimeUnit

class PollException(val code: Int, message: String) : Exception(message)

class ApiClient(private val serverUrl: String, private val jwtToken: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    companion object {
        private const val TAG = "ApiClient"

        /**
         * Login with username/email + password. Returns JWT token on success.
         */
        fun login(serverUrl: String, username: String, password: String): Result<String> {
            val httpClient = OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()
            val gsonInstance = Gson()
            val jsonType = "application/json; charset=utf-8".toMediaType()

            val body = gsonInstance.toJson(mapOf(
                "emailOrUsername" to username,
                "password" to password
            ))

            val request = Request.Builder()
                .url("${serverUrl.trimEnd('/')}/api/auth/login")
                .post(body.toRequestBody(jsonType))
                .build()

            return try {
                httpClient.newCall(request).execute().use { resp ->
                    val respBody = resp.body?.string() ?: ""
                    if (!resp.isSuccessful) {
                        val errorMsg = try {
                            val parsed = gsonInstance.fromJson(respBody, Map::class.java) as? Map<*, *>
                            parsed?.get("error")?.toString() ?: "HTTP ${resp.code}"
                        } catch (_: Exception) { "HTTP ${resp.code}" }
                        return Result.failure(Exception(errorMsg))
                    }
                    val parsed = gsonInstance.fromJson(respBody, Map::class.java) as? Map<*, *>
                    @Suppress("UNCHECKED_CAST")
                    val data = parsed?.get("data") as? Map<String, Any>
                    val token = data?.get("token")?.toString()
                    if (token.isNullOrBlank()) {
                        return Result.failure(Exception("No token in response"))
                    }
                    AppLogger.i(TAG, "Login successful for user=$username")
                    Result.success(token)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Login error", e)
                Result.failure(e)
            }
        }
    }

    fun register(uuid: String, name: String, fcmToken: String? = null): Boolean {
        val arch = (System.getProperty("os.arch") as? String) ?: "arm64"
        val payload = mutableMapOf<String, Any>(
            "uuid" to uuid,
            "name" to name,
            "os" to "android",
            "arch" to arch,
            "desktop" to "Android",
            "appVersion" to "0.6.1"
        )
        if (!fcmToken.isNullOrBlank()) {
            payload["fcmToken"] = fcmToken
        }
        val body = gson.toJson(payload)

        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/push/register")
            .post(body.toRequestBody(JSON))
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "Register failed: ${resp.code}")
                } else {
                    AppLogger.i(TAG, "Registered client uuid=$uuid")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Register error", e)
            false
        }
    }

    fun updateClient(uuid: String, name: String): Boolean {
        val body = gson.toJson(mapOf(
            "uuid" to uuid,
            "name" to name,
        ))

        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/push/client")
            .patch(body.toRequestBody(JSON))
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "Update client failed: ${resp.code}")
                } else {
                    AppLogger.i(TAG, "Client updated uuid=$uuid")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Update client error", e)
            false
        }
    }

    /** Returns true if the response was a 401 (JWT expired) */
    fun isJwtExpired(code: Int): Boolean = code == 401

    fun poll(uuid: String): List<PushMessage> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/push/poll?uuid=$uuid")
            .get()
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "Poll failed: ${resp.code}")
                    return emptyList()
                }
                val body = resp.body?.string() ?: return emptyList()
                val type = object : TypeToken<ApiResponse<List<PushMessage>>>() {}.type
                val apiResp: ApiResponse<List<PushMessage>> = gson.fromJson(body, type)
                AppLogger.d(TAG, "Poll returned ${apiResp.data?.size ?: 0} messages")
                apiResp.data ?: emptyList()
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Poll error", e)
            emptyList()
        }
    }

    fun pollRawResponse(uuid: String): Pair<Int, List<PushMessage>> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/push/poll?uuid=$uuid")
            .get()
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return client.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) {
                AppLogger.w(TAG, "Poll failed: ${resp.code}")
                throw PollException(resp.code, "HTTP ${resp.code}")
            }
            val body = resp.body?.string() ?: throw PollException(resp.code, "Empty response body")
            val type = object : TypeToken<ApiResponse<List<PushMessage>>>() {}.type
            val apiResp: ApiResponse<List<PushMessage>> = gson.fromJson(body, type)
            val messages = apiResp.data ?: emptyList()
            AppLogger.d(TAG, "Poll returned ${messages.size} messages, code=${resp.code}")
            Pair(resp.code, messages)
        }
    }

    /** Acknowledge messages on the server so they won't be re-delivered via poll */
    fun ack(uuid: String, ids: List<String>) {
        if (ids.isEmpty()) return
        val body = gson.toJson(mapOf("uuid" to uuid, "messageIds" to ids))
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/push/ack")
            .post(body.toRequestBody(JSON))
            .header("Authorization", "Bearer $jwtToken")
            .build()
        try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "Ack failed: ${resp.code}")
                } else {
                    AppLogger.d(TAG, "Acked ${ids.size} messages")
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Ack error", e)
        }
    }

    fun send(
        channel: String,
        to: String,
        subject: String? = null,
        body: String? = null,
        tags: List<String>? = null,
        priority: Int? = null,
        url: String? = null,
        format: String? = null,
        attachmentName: String? = null,
        attachmentUrl: String? = null,
    ): Result<String> {
        val payload = mutableMapOf<String, Any>(
            "channel" to channel,
            "to" to to,
        )
        subject?.let { payload["subject"] = it }
        body?.let { payload["body"] = it }
        tags?.takeIf { it.isNotEmpty() }?.let { payload["tags"] = it }
        priority?.let { payload["priority"] = it }
        url?.let { payload["url"] = it }
        format?.let { payload["format"] = it }
        if (attachmentName != null) {
            val att = mutableMapOf<String, Any>("name" to attachmentName)
            attachmentUrl?.let { att["url"] = it }
            payload["attachment"] = att
        }

        val jsonBody = gson.toJson(payload)
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/v1/send")
            .post(jsonBody.toRequestBody(JSON))
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                val respBody = resp.body?.string() ?: ""
                if (!resp.isSuccessful) {
                    val errorMsg = try {
                        val parsed = gson.fromJson(respBody, Map::class.java) as? Map<*, *>
                        parsed?.get("error")?.toString() ?: "HTTP ${resp.code}"
                    } catch (_: Exception) { "HTTP ${resp.code}" }
                    return Result.failure(Exception(errorMsg))
                }
                val parsed = gson.fromJson(respBody, Map::class.java) as? Map<*, *>
                val data = parsed?.get("data") as? Map<*, *>
                val messageId = data?.get("messageId")?.toString() ?: ""
                AppLogger.i(TAG, "Message sent to=$to channel=$channel")
                Result.success(messageId)
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Send error", e)
            Result.failure(e)
        }
    }

    data class UploadQuota(
        val maxFileSize: Long?,    // null = unlimited (admin)
        val maxTotalSize: Long?,   // null = unlimited (admin)
        val usedBytes: Long,
        val remainingBytes: Long?, // null = unlimited (admin)
        val fileCount: Int,
        val isAdmin: Boolean,
    )

    fun getUploadQuota(): Result<UploadQuota> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/upload/quota")
            .get()
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                val body = resp.body?.string() ?: ""
                if (!resp.isSuccessful) {
                    val errorMsg = try {
                        val parsed = gson.fromJson(body, Map::class.java) as? Map<*, *>
                        parsed?.get("error")?.toString() ?: "HTTP ${resp.code}"
                    } catch (_: Exception) { "HTTP ${resp.code}" }
                    return Result.failure(Exception(errorMsg))
                }
                val parsed = gson.fromJson(body, Map::class.java) as? Map<*, *>
                @Suppress("UNCHECKED_CAST")
                val data = parsed?.get("data") as? Map<String, Any> ?: return Result.failure(Exception("No data"))
                AppLogger.d(TAG, "Upload quota fetched")
                Result.success(UploadQuota(
                    maxFileSize = (data["maxFileSize"] as? Number)?.toLong(),
                    maxTotalSize = (data["maxTotalSize"] as? Number)?.toLong(),
                    usedBytes = (data["usedBytes"] as? Number)?.toLong() ?: 0L,
                    remainingBytes = (data["remainingBytes"] as? Number)?.toLong(),
                    fileCount = (data["fileCount"] as? Number)?.toInt() ?: 0,
                    isAdmin = data["isAdmin"] as? Boolean ?: false,
                ))
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Get upload quota error", e)
            Result.failure(e)
        }
    }

    fun uploadFile(fileName: String, mimeType: String, inputStream: InputStream): Result<Map<String, Any?>> {
        val bytes = inputStream.readBytes()
        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file", fileName,
                bytes.toRequestBody(mimeType.toMediaType())
            )
            .build()

        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/upload")
            .post(requestBody)
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                val body = resp.body?.string() ?: ""
                if (!resp.isSuccessful) {
                    val errorMsg = try {
                        val parsed = gson.fromJson(body, Map::class.java) as? Map<*, *>
                        parsed?.get("error")?.toString() ?: "HTTP ${resp.code}"
                    } catch (_: Exception) { "HTTP ${resp.code}" }
                    return Result.failure(Exception(errorMsg))
                }
                val parsed = gson.fromJson(body, Map::class.java) as? Map<*, *>
                @Suppress("UNCHECKED_CAST")
                val data = parsed?.get("data") as? Map<String, Any?> ?: return Result.failure(Exception("No data"))
                AppLogger.i(TAG, "Uploaded file=$fileName")
                Result.success(data)
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Upload file error", e)
            Result.failure(e)
        }
    }

    fun deleteTopic(topicId: String): Boolean {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/v1/topic/$topicId")
            .delete()
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "Delete topic failed: ${resp.code}")
                } else {
                    AppLogger.i(TAG, "Topic deleted: $topicId")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Delete topic error", e)
            false
        }
    }

    fun listClients(): List<Map<String, Any?>> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/user/clients")
            .get()
            .header("Authorization", "Bearer $jwtToken")
            .build()

        return try {
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    AppLogger.w(TAG, "List clients failed: ${resp.code}")
                    return emptyList()
                }
                val body = resp.body?.string() ?: return emptyList()
                val type = object : TypeToken<ApiResponse<List<Map<String, Any>>>>() {}.type
                val apiResp: ApiResponse<List<Map<String, Any>>> = gson.fromJson(body, type)
                @Suppress("UNCHECKED_CAST")
                val clients = apiResp.data as? List<Map<String, Any?>> ?: emptyList()
                AppLogger.d(TAG, "Listed ${clients.size} clients")
                clients
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "List clients error", e)
            emptyList()
        }
    }
}

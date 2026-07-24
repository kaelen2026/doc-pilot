package dev.w3ctech.docpilot.data

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.net.URLEncoder
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class DocPilotRepository(private val api: ApiClient, private val sessions: SessionStore) {
  suspend fun restore(): AuthSession? = withContext(Dispatchers.IO) {
    if (sessions.token == null) return@withContext null
    runCatching { api.decode<AuthSession>("/api/auth/get-session") }.getOrElse {
      if (it is ApiException && it.status == 401) sessions.token = null
      null
    }
  }

  suspend fun sendOtp(email: String) = withContext(Dispatchers.IO) {
    api.request("/api/auth/email-otp/send-verification-otp", "POST", """{"email":${q(email)},"type":"sign-in"}""").close()
  }

  suspend fun signIn(email: String, secret: String, otp: Boolean): AuthSession = withContext(Dispatchers.IO) {
    val path = if (otp) "/api/auth/sign-in/email-otp" else "/api/auth/sign-in/email"
    val key = if (otp) "otp" else "password"
    api.request(path, "POST", """{"email":${q(email)},"$key":${q(secret)}}""").use {
      sessions.token = it.header("set-auth-token") ?: error("登录响应缺少会话令牌")
    }
    api.decode("/api/auth/get-session")
  }

  suspend fun signInGoogle(idToken: String): AuthSession = withContext(Dispatchers.IO) {
    api.request("/api/auth/sign-in/social", "POST", """{"provider":"google","idToken":{"token":${q(idToken)}}}""").use {
      sessions.token = it.header("set-auth-token") ?: error("登录响应缺少会话令牌")
    }
    api.decode("/api/auth/get-session")
  }

  suspend fun signOut() = withContext(Dispatchers.IO) {
    runCatching { api.request("/api/auth/sign-out", "POST").close() }
    sessions.token = null
  }

  suspend fun documents(): List<DocumentItem> = withContext(Dispatchers.IO) { api.decode<DocumentsResponse>("/documents").documents }
  suspend fun notifications(): List<NotificationItem> = withContext(Dispatchers.IO) { api.decode<NotificationsResponse>("/notifications").notifications }
  suspend fun usage(): Usage = withContext(Dispatchers.IO) { api.decode<UsageResponse>("/me/usage").usage }
  suspend fun search(query: String): List<SearchResult> = withContext(Dispatchers.IO) {
    api.decode<SearchResponse>("/search?q=${URLEncoder.encode(query, Charsets.UTF_8)}").results
  }

  suspend fun upload(resolver: ContentResolver, uri: Uri): String = withContext(Dispatchers.IO) {
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
      if (it.moveToFirst()) it.getString(0) else "document.pdf"
    } ?: "document.pdf"
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("无法读取文件")
    val checksum = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    val created = api.decode<CreateUploadResponse>(
      "/documents", "POST",
      """{"filename":${q(name)},"contentType":"application/pdf","sizeBytes":${bytes.size},"checksumSha256":"$checksum"}""",
      mapOf("Idempotency-Key" to "android-upload-$checksum"),
    )
    if (created.duplicate == true) return@withContext created.document.id
    val target = created.upload ?: error("上传地址缺失")
    val builder = Request.Builder().url(target.url).method(target.method, bytes.toRequestBody())
    target.headers.forEach(builder::header)
    api.http.newCall(builder.build()).execute().use { if (!it.isSuccessful) throw ApiException(it.code, "对象存储上传失败") }
    api.request("/documents/${created.document.id}/complete-upload", "POST").close()
    created.document.id
  }

  suspend fun conversation(documentId: String): Conversation = withContext(Dispatchers.IO) {
    val existing = api.decode<ConversationsResponse>("/conversations?documentId=$documentId").conversations.firstOrNull()
    existing ?: api.decode<ConversationResponse>("/conversations", "POST", """{"documentId":${q(documentId)}}""").conversation
  }
  suspend fun messages(conversationId: String) = withContext(Dispatchers.IO) {
    api.decode<MessagesResponse>("/conversations/$conversationId/messages?limit=30").messages
  }
  fun ask(conversationId: String, question: String): Flow<ChatEvent> =
    api.stream("/conversations/$conversationId/messages", """{"content":${q(question)},"clientRequestId":"android-${UUID.randomUUID()}"}""")

  suspend fun fileUrl(documentId: String): String = withContext(Dispatchers.IO) { api.decode<FileUrlResponse>("/documents/$documentId/file-url").url }
  suspend fun downloadPdf(context: Context, userId: String, documentId: String): File = withContext(Dispatchers.IO) {
    val directory = File(context.cacheDir, "documents/${safe(userId)}").apply { mkdirs() }
    val target = File(directory, "${safe(documentId)}.pdf")
    if (target.exists() && target.length() > 4) return@withContext target
    val bytes = api.request(fileUrl(documentId)).use { it.body.bytes() }
    require(bytes.size >= 5 && bytes.copyOfRange(0, 5).decodeToString() == "%PDF-") { "服务端返回的文件不是有效 PDF" }
    val temporary = File(target.path + ".download")
    temporary.writeBytes(bytes)
    temporary.renameTo(target)
    target
  }
  suspend fun scheduleDeletion() = withContext(Dispatchers.IO) { api.request("/me/deletion", "POST").close() }
  suspend fun approveDevice(code: String) = withContext(Dispatchers.IO) {
    api.decode<Map<String, Boolean>>("/api/auth/device?user_code=${URLEncoder.encode(code, Charsets.UTF_8)}")
    api.request("/api/auth/device/approve", "POST", """{"userCode":${q(code)}}""").close()
  }
  suspend fun registerPush(token: String) = withContext(Dispatchers.IO) {
    api.request("/push/devices", "POST", """{"token":${q(token)},"platform":"android","environment":"production"}""").close()
  }

  private fun q(value: String) = api.json.encodeToString(value)
  private fun safe(value: String) = value.replace(Regex("[^A-Za-z0-9-]"), "_")
}

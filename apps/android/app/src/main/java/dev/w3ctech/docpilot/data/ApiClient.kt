package dev.w3ctech.docpilot.data

import dev.w3ctech.docpilot.BuildConfig
import dev.w3ctech.docpilot.core.SseParser
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiException(val status: Int, message: String) : IOException(message)

class ApiClient(
  private val token: () -> String?,
  val http: OkHttpClient = OkHttpClient(),
  private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
) {
  val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

  fun request(path: String, method: String = "GET", body: String? = null, headers: Map<String, String> = emptyMap()): okhttp3.Response {
    val builder = Request.Builder().url(if (path.startsWith("http")) path else "$baseUrl$path")
      .header("Accept", "application/json")
    token()?.let { builder.header("Authorization", "Bearer $it") }
    headers.forEach(builder::header)
    val requestBody = body?.toRequestBody("application/json".toMediaType())
    builder.method(method, if (method == "GET" || method == "DELETE") null else requestBody ?: ByteArray(0).toRequestBody())
    val response = http.newCall(builder.build()).execute()
    if (!response.isSuccessful) {
      val message = response.body.string().take(300)
      response.close()
      throw ApiException(response.code, message)
    }
    return response
  }

  inline fun <reified T> decode(path: String, method: String = "GET", body: String? = null, headers: Map<String, String> = emptyMap()): T =
    request(path, method, body, headers).use { json.decodeFromString(it.body.string()) }

  fun stream(path: String, body: String): Flow<ChatEvent> = flow {
    val parser = SseParser()
    request(path, "POST", body, mapOf("Accept" to "text/event-stream")).use { response ->
      val source = response.body.source()
      while (!source.exhausted()) {
        parser.feed(source.readUtf8LineStrict() + "\n").forEach { frame ->
          val value = runCatching { json.parseToJsonElement(frame.data).jsonObject }.getOrNull()
          when (frame.event) {
            "message.delta" -> emit(ChatEvent.Delta(value?.get("text")?.jsonPrimitive?.content ?: ""))
            "citation" -> emit(ChatEvent.CitationPage(value?.get("pageStart")?.jsonPrimitive?.content?.toIntOrNull()))
            "message.failed" -> emit(ChatEvent.Failed(value?.get("errorCode")?.jsonPrimitive?.content ?: "AI_UNKNOWN"))
            "message.completed" -> emit(ChatEvent.Completed)
          }
        }
      }
    }
  }.flowOn(Dispatchers.IO)
}

package dev.w3ctech.docpilot.data

import kotlinx.serialization.Serializable

@Serializable data class UserDto(val id: String, val name: String, val email: String)
@Serializable data class SessionDto(val id: String, val expiresAt: String)
@Serializable data class AuthSession(val user: UserDto, val session: SessionDto)
@Serializable data class DocumentItem(
  val id: String,
  val title: String,
  val status: String,
  val currentStage: String? = null,
  val progress: Int = 0,
  val sizeBytes: Long = 0,
  val pageCount: Int? = null,
  val errorCode: String? = null,
  val createdAt: String = "",
)
@Serializable data class DocumentsResponse(val documents: List<DocumentItem>)
@Serializable data class UploadTarget(val method: String, val url: String, val headers: Map<String, String> = emptyMap())
@Serializable data class CreatedDocument(val id: String, val status: String)
@Serializable data class CreateUploadResponse(val document: CreatedDocument, val upload: UploadTarget? = null, val duplicate: Boolean? = null)
@Serializable data class Conversation(val id: String, val documentId: String, val title: String? = null, val createdAt: String = "")
@Serializable data class ConversationsResponse(val conversations: List<Conversation>)
@Serializable data class ConversationResponse(val conversation: Conversation)
@Serializable data class Citation(
  val id: String,
  val chunkId: String,
  val quote: String,
  val claim: String? = null,
  val pageStart: Int? = null,
  val pageEnd: Int? = null,
  val score: String? = null,
  val position: Int = 0,
)
@Serializable data class ChatMessage(
  val id: String,
  val role: String,
  val content: String,
  val status: String,
  val citations: List<Citation> = emptyList(),
)
@Serializable data class MessagesResponse(val messages: List<ChatMessage>, val hasMore: Boolean)
@Serializable data class Passage(val chunkId: String, val content: String, val pageStart: Int? = null)
@Serializable data class SearchResult(val documentId: String, val title: String, val score: Double, val passages: List<Passage>)
@Serializable data class SearchResponse(val results: List<SearchResult>)
@Serializable data class NotificationItem(
  val id: String,
  val type: String,
  val title: String,
  val body: String,
  val resourceType: String,
  val resourceId: String,
  val read: Boolean,
  val createdAt: String,
)
@Serializable data class NotificationsResponse(val notifications: List<NotificationItem>)
@Serializable data class UsageAmount(val used: Long, val limit: Long)
@Serializable data class Usage(
  val storageBytes: UsageAmount,
  val documentCount: UsageAmount,
  val monthlyAiTokens: UsageAmount,
  val monthlyQuestions: UsageAmount,
)
@Serializable data class UsageResponse(val usage: Usage)
@Serializable data class FileUrlResponse(val url: String)

sealed interface ChatEvent {
  data class Delta(val text: String) : ChatEvent
  data class CitationPage(val page: Int?) : ChatEvent
  data class Failed(val code: String) : ChatEvent
  data object Completed : ChatEvent
}

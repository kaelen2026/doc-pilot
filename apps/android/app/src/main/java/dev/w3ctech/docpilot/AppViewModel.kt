package dev.w3ctech.docpilot

import android.app.Application
import android.net.Uri
import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.graphics.createBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.w3ctech.docpilot.data.AuthSession
import dev.w3ctech.docpilot.data.ChatEvent
import dev.w3ctech.docpilot.data.DocumentItem
import dev.w3ctech.docpilot.data.NotificationItem
import dev.w3ctech.docpilot.data.SearchResult
import dev.w3ctech.docpilot.data.Usage
import dev.w3ctech.docpilot.data.GoogleSignIn
import dev.w3ctech.docpilot.data.HighlightEntity
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

enum class Page { Documents, Account, Search, Notifications, Scanner, Reader }

class AppViewModel(application: Application) : AndroidViewModel(application) {
  private val repo = (application as DocPilotApplication).repository
  private val highlights = (application as DocPilotApplication).database.highlights()
  var session by mutableStateOf<AuthSession?>(null); private set
  var restoring by mutableStateOf(true); private set
  var busy by mutableStateOf(false); private set
  var error by mutableStateOf<String?>(null); private set
  var otpSent by mutableStateOf(false); private set
  var documents by mutableStateOf<List<DocumentItem>>(emptyList()); private set
  var notifications by mutableStateOf<List<NotificationItem>>(emptyList()); private set
  var searchResults by mutableStateOf<List<SearchResult>>(emptyList()); private set
  var usage by mutableStateOf<Usage?>(null); private set
  var page by mutableStateOf(Page.Documents)
  var selectedDocument by mutableStateOf<DocumentItem?>(null)
  var chatText by mutableStateOf(""); private set
  var citationPage by mutableStateOf<Int?>(null); private set
  var pdfPage by mutableStateOf<Bitmap?>(null); private set
  var pdfPageIndex by mutableIntStateOf(0); private set
  var pdfPageCount by mutableIntStateOf(0); private set
  var highlightedPages by mutableStateOf<Set<Int>>(emptySet()); private set
  private var renderer: PdfRenderer? = null

  init { viewModelScope.launch {
    session = repo.restore()
    restoring = false
    if (session != null) {
      refresh()
      registerPush()
    }
  } }

  fun sendOtp(email: String) = run { repo.sendOtp(email); otpSent = true }
  fun login(email: String, secret: String, otp: Boolean) = run {
    session = repo.signIn(email, secret, otp); refresh(); registerPush()
  }
  fun googleSignIn(context: Context) = run {
    session = repo.signInGoogle(GoogleSignIn(context).idToken()); refresh(); registerPush()
  }
  fun refresh() = run { documents = repo.documents() }
  fun upload(uri: Uri) = run {
    repo.upload(getApplication<Application>().contentResolver, uri); documents = repo.documents()
  }
  fun open(document: DocumentItem, initialPage: Int? = null) {
    selectedDocument = document
    citationPage = initialPage
    chatText = ""
    page = Page.Reader
    run {
      val file = repo.downloadPdf(getApplication(), session!!.user.id, document.id)
      renderer?.close()
      renderer = PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY))
      pdfPageCount = renderer?.pageCount ?: 0
      renderPage(((initialPage ?: 1) - 1).coerceAtLeast(0))
      viewModelScope.launch {
        highlights.observe(session!!.user.id, document.id).collect { rows ->
          highlightedPages = rows.mapTo(mutableSetOf()) { it.page }
        }
      }
    }
  }
  fun highlightCurrentPage() = run {
    highlights.put(HighlightEntity(session!!.user.id, selectedDocument!!.id, pdfPageIndex + 1))
  }
  fun renderPage(index: Int) {
    val active = renderer ?: return
    val target = index.coerceIn(0, (active.pageCount - 1).coerceAtLeast(0))
    active.openPage(target).use { page ->
      val width = (page.width * 1.5f).toInt()
      // KTX createBitmap 默认即 ARGB_8888,行为等价
      val bitmap = createBitmap(width, (page.height * 1.5f).toInt())
      bitmap.eraseColor(android.graphics.Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      pdfPage = bitmap
      pdfPageIndex = target
    }
  }
  fun ask(question: String) = run {
    chatText = ""
    val conversation = repo.conversation(selectedDocument!!.id)
    repo.messages(conversation.id).lastOrNull()?.let { if (it.role == "assistant") chatText = it.content }
    repo.ask(conversation.id, question).collect {
      when (it) {
        is ChatEvent.Delta -> chatText += it.text
        is ChatEvent.CitationPage -> citationPage = it.page
        is ChatEvent.Failed -> error = "回答失败：${it.code}"
        ChatEvent.Completed -> Unit
      }
    }
  }
  fun search(query: String) = run { searchResults = repo.search(query) }
  fun loadNotifications() = run { notifications = repo.notifications() }
  fun loadAccount() = run { usage = repo.usage() }
  fun approve(code: String) = run { repo.approveDevice(code); page = Page.Account }
  fun signOut() = run { repo.signOut(); session = null; documents = emptyList() }
  fun deleteAccount() = run { repo.scheduleDeletion(); repo.signOut(); session = null }
  fun clearError() { error = null }

  private suspend fun registerPush() {
    runCatching { repo.registerPush(FirebaseMessaging.getInstance().token.await()) }
  }

  private fun run(block: suspend () -> Unit) {
    viewModelScope.launch {
      busy = true
      error = null
      runCatching { block() }.onFailure { error = it.message ?: "操作失败，请稍后重试。" }
      busy = false
    }
  }
}

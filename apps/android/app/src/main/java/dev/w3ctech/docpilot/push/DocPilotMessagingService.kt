package dev.w3ctech.docpilot.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.w3ctech.docpilot.DocPilotApplication
import dev.w3ctech.docpilot.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class DocPilotMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    val app = application as DocPilotApplication
    if (app.sessions.token == null) return
    CoroutineScope(Dispatchers.IO).launch { runCatching { app.repository.registerPush(token) } }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val title = message.notification?.title ?: message.data["title"] ?: "DocPilot"
    val body = message.notification?.body ?: message.data["body"] ?: "文档状态已更新"
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("documentId", message.data["resourceId"])
    }
    val pending = PendingIntent.getActivity(
      this, message.messageId.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(this, "documents")
      .setSmallIcon(android.R.drawable.ic_menu_info_details)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setContentIntent(pending)
      .build()
    getSystemService(NotificationManager::class.java).notify(message.messageId.hashCode(), notification)
  }
}

package dev.w3ctech.docpilot

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dev.w3ctech.docpilot.data.ApiClient
import dev.w3ctech.docpilot.data.DocPilotRepository
import dev.w3ctech.docpilot.data.SessionStore

class DocPilotApplication : Application() {
  lateinit var sessions: SessionStore
  lateinit var repository: DocPilotRepository

  override fun onCreate() {
    super.onCreate()
    sessions = SessionStore(this)
    repository = DocPilotRepository(ApiClient({ sessions.token }), sessions)
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel("documents", "文档处理", NotificationManager.IMPORTANCE_DEFAULT),
    )
  }
}

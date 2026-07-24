package dev.w3ctech.docpilot.data

import android.content.Context
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionStore(context: Context) {
  private val prefs = EncryptedSharedPreferences.create(
    context,
    "docpilot-session",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
  )
  var token: String?
    get() = prefs.getString("bearer", null)
    set(value) {
      // KTX edit 默认走 apply(),与原写法行为等价
      prefs.edit { if (value == null) remove("bearer") else putString("bearer", value) }
    }
}

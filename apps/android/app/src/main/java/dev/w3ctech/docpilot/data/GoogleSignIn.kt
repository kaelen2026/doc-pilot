package dev.w3ctech.docpilot.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import dev.w3ctech.docpilot.BuildConfig

class GoogleSignIn(private val context: Context) {
  suspend fun idToken(): String {
    require(BuildConfig.GOOGLE_CLIENT_ID.isNotBlank()) { "请配置 DOC_PILOT_GOOGLE_CLIENT_ID" }
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_CLIENT_ID).build()
    val response = CredentialManager.create(context).getCredential(
      context,
      GetCredentialRequest.Builder().addCredentialOption(option).build(),
    )
    val credential = response.credential as? CustomCredential
      ?: error("Google 未返回可识别的凭据")
    require(credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
      "Google 凭据类型不匹配"
    }
    return GoogleIdTokenCredential.createFrom(credential.data).idToken
  }
}

package dev.w3ctech.docpilot.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import dev.w3ctech.docpilot.BuildConfig

class GoogleSignIn(private val context: Context) {
  suspend fun idToken(): String {
    require(BuildConfig.GOOGLE_CLIENT_ID.isNotBlank()) { "请配置 DOC_PILOT_GOOGLE_CLIENT_ID" }
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_CLIENT_ID).build()
    val response = try {
      CredentialManager.create(context).getCredential(
        context,
        GetCredentialRequest.Builder().addCredentialOption(option).build(),
      )
    } catch (exception: NoCredentialException) {
      // 设备无可用 Google 凭据(未登录 Google 账号等):转成友好提示,由调用方的
      // 现有 error 通道展示并引导改用邮箱登录,不 crash,成功路径行为不变
      error("设备上没有可用的 Google 账号，请先在系统设置登录 Google，或改用邮箱登录")
    }
    val credential = response.credential as? CustomCredential
      ?: error("Google 未返回可识别的凭据")
    require(credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
      "Google 凭据类型不匹配"
    }
    return GoogleIdTokenCredential.createFrom(credential.data).idToken
  }
}

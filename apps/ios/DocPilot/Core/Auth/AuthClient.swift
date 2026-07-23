import Foundation

struct AuthSession: Decodable, Sendable, Equatable {
    struct User: Decodable, Sendable, Equatable { let id: String; let name: String; let email: String }
    struct Session: Decodable, Sendable, Equatable { let id: String; let expiresAt: Date }
    let user: User
    let session: Session
}

struct AuthClient: Sendable {
    let api: APIClient
    let tokenStore: any SecureTokenStore

    func sendOTP(email: String) async throws {
        let _: EmptyResponse = try await api.send(
            "/api/auth/email-otp/send-verification-otp",
            method: "POST",
            body: SendOTPBody(email: email, type: "sign-in")
        )
    }

    func verifyOTP(email: String, otp: String) async throws -> AuthSession {
        try await bearerSignIn(
            path: "/api/auth/sign-in/email-otp",
            body: VerifyOTPBody(email: email, otp: otp)
        )
    }

    /// 邮箱 + 密码登录:`POST /api/auth/sign-in/email`,请求体 `{ email, password }`。
    /// 收尾与 `verifyOTP`/`signInWithApple` 完全一致——从响应头 `set-auth-token` 取 bearer
    /// 存 Keychain,再 `restoreSession()` 拉 `AuthSession`(见 bearerSignIn)。
    func signInWithPassword(email: String, password: String) async throws -> AuthSession {
        try await bearerSignIn(
            path: "/api/auth/sign-in/email",
            body: SignInEmailBody(email: email, password: password)
        )
    }

    /// 原生 Sign in with Apple:把 Apple 返回的 idToken 交给后端换取会话。
    /// 收尾与 `verifyOTP` 完全一致(见 bearerSignIn)。`nonce` 传 iOS 生成的 raw nonce(见 AppleSignIn)。
    func signInWithApple(identityToken: String, nonce: String?) async throws -> AuthSession {
        try await bearerSignIn(
            path: "/api/auth/sign-in/social",
            body: SignInSocialBody(
                provider: "apple",
                idToken: SignInSocialBody.IDToken(token: identityToken, nonce: nonce)
            )
        )
    }

    /// 原生 Google 登录:把 GoogleSignIn 返回的 idToken 交给后端换取会话。
    /// 与 Apple 同构走 `POST /api/auth/sign-in/social`(provider=google),但 Google 无需 nonce
    /// (nonce 传 nil → JSONEncoder 省略该键)。收尾复用 bearerSignIn(见 signInWithApple)。
    func signInWithGoogle(idToken: String) async throws -> AuthSession {
        try await bearerSignIn(
            path: "/api/auth/sign-in/social",
            body: SignInSocialBody(
                provider: "google",
                idToken: SignInSocialBody.IDToken(token: idToken, nonce: nil)
            )
        )
    }

    /// bearer 登录收尾:POST body → 从响应头 `set-auth-token` 取 bearer 存 Keychain →
    /// `restoreSession()` 拉 `AuthSession`。OTP / 密码 / Apple / Google 登录路径共用此收尾。
    private func bearerSignIn(path: String, body: some Encodable) async throws -> AuthSession {
        let response = try await api.transport.send(try request(path: path, body: body))
        guard 200..<300 ~= response.response.statusCode else {
            if response.response.statusCode == 401 { throw APIError.unauthorized }
            throw APIError.server(statusCode: response.response.statusCode, code: nil)
        }
        guard let token = response.response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError.invalidResponse
        }
        try tokenStore.saveToken(token)
        guard let session = try await restoreSession() else { throw APIError.unauthorized }
        return session
    }

    func restoreSession() async throws -> AuthSession? {
        guard let token = try tokenStore.loadToken() else { return nil }
        var authenticated = api
        authenticated.token = { token }
        do {
            return try await authenticated.send("/api/auth/get-session")
        } catch APIError.unauthorized {
            try tokenStore.deleteToken()
            return nil
        }
    }

    func signOut() async throws {
        if try tokenStore.loadToken() != nil {
            var authenticated = api
            authenticated.token = { try? tokenStore.loadToken() }
            let _: EmptyResponse = try await authenticated.send(
                "/api/auth/sign-out", method: "POST", body: EmptyBody()
            )
        }
        try tokenStore.deleteToken()
    }

    private func request(path: String, body: some Encodable) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: api.baseURL) else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("docpilot://", forHTTPHeaderField: "Origin")
        return request
    }
}

private struct SendOTPBody: Encodable, Sendable { let email: String; let type: String }
private struct VerifyOTPBody: Encodable, Sendable { let email: String; let otp: String }
private struct SignInEmailBody: Encodable, Sendable { let email: String; let password: String }
private struct EmptyBody: Encodable, Sendable {}

/// better-auth `POST /api/auth/sign-in/social` 的原生 idToken 登录形状:
/// `{ provider, idToken: { token, nonce? } }`。nonce 为 nil 时 JSONEncoder 省略该键。
private struct SignInSocialBody: Encodable, Sendable {
    let provider: String
    let idToken: IDToken
    struct IDToken: Encodable, Sendable { let token: String; let nonce: String? }
}

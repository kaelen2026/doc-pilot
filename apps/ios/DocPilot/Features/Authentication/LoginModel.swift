import AuthenticationServices
import Foundation
import Observation

@MainActor @Observable
final class LoginModel {
    enum Step { case email, otp }

    var email = ""
    var otp = ""
    private(set) var step: Step = .email
    private(set) var isSubmitting = false
    private(set) var errorMessage: String?
    private(set) var session: AuthSession?
    private let authClient: AuthClient
    /// 本次 Apple 请求的 raw nonce:onRequest 生成、onCompletion 回传给后端(见 AppleSignIn 的防重放约定)。
    private var pendingAppleNonce: String?

    init(authClient: AuthClient) {
        self.authClient = authClient
        // 截图/联调用:-previewOtp 直达验证码页并预填数位以展示分格态(生产无副作用)。
        if ProcessInfo.processInfo.arguments.contains("-previewOtp") {
            email = "you@example.com"
            otp = "935"
            step = .otp
        }
    }

    /// OTP 位数,输满即自动验证。
    static let otpLength = 6

    var canSubmit: Bool {
        !isSubmitting && (step == .email ? email.contains("@") : otp.count >= Self.otpLength)
    }

    /// 从 OTP 页退回邮箱页:清空验证码与错误,重新输入邮箱。
    func backToEmail() {
        step = .email
        otp = ""
        errorMessage = nil
    }

    /// 在 OTP 页重新发送验证码。
    func resendOTP() async {
        guard step == .otp, !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        otp = ""
        defer { isSubmitting = false }
        do { try await authClient.sendOTP(email: email) } catch { errorMessage = "发送失败,请稍后重试。" }
    }

    func restore() async {
        isSubmitting = true
        defer { isSubmitting = false }
        session = try? await authClient.restoreSession()
    }

    func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            switch step {
            case .email:
                try await authClient.sendOTP(email: email)
                step = .otp
            case .otp:
                session = try await authClient.verifyOTP(email: email, otp: otp)
            }
        } catch {
            errorMessage = "请求失败，请稍后重试。"
            if step == .otp { otp = "" }  // 验证失败清空,格子复位便于重输
        }
    }

    /// SignInWithAppleButton 的 onRequest:生成 raw nonce,下发其 SHA-256 给 Apple,并索要邮箱/姓名。
    func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let raw = AppleSignIn.randomNonce()
        pendingAppleNonce = raw
        request.requestedScopes = [.fullName, .email]
        request.nonce = AppleSignIn.sha256Hex(raw)
    }

    /// SignInWithAppleButton 的 onCompletion:取消静默,拿到 idToken 后走与 OTP 一致的登录态切换。
    func completeAppleSignIn(_ result: Result<ASAuthorization, any Error>) async {
        switch result {
        case let .failure(error):
            // 用户主动取消不算错误,静默返回。
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return }
            errorMessage = "登录失败，请稍后重试。"
        case let .success(authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "登录失败，请稍后重试。"
                return
            }
            isSubmitting = true
            errorMessage = nil
            defer { isSubmitting = false }
            do {
                session = try await authClient.signInWithApple(
                    identityToken: identityToken, nonce: pendingAppleNonce
                )
            } catch {
                errorMessage = "登录失败，请稍后重试。"
            }
            pendingAppleNonce = nil
        }
    }

    func signOut() async {
        try? await authClient.signOut()
        session = nil
        otp = ""
        step = .email
    }
}

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

    init(authClient: AuthClient) { self.authClient = authClient }

    var canSubmit: Bool {
        !isSubmitting && (step == .email ? email.contains("@") : otp.count >= 6)
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
        }
    }

    func signOut() async {
        try? await authClient.signOut()
        session = nil
        otp = ""
        step = .email
    }
}

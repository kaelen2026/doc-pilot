import Foundation
import Observation

@MainActor @Observable
final class AccountModel {
    private(set) var me: MeResponse?
    private(set) var usage: UsageResponse.Usage?
    private(set) var errorMessage: String?
    private let api: APIClient
    private let signOutAction: () async -> Void

    init(api: APIClient, signOut: @escaping () async -> Void) {
        self.api = api
        signOutAction = signOut
    }

    func load() async {
        do {
            async let meRequest: MeResponse = api.send("/api/v1/me")
            async let usageRequest: UsageResponse = api.send("/api/v1/me/usage")
            let (me, usage) = try await (meRequest, usageRequest)
            self.me = me
            self.usage = usage.usage
            errorMessage = nil
        } catch { errorMessage = "账户信息加载失败。" }
    }

    func signOut() async { await signOutAction() }
}

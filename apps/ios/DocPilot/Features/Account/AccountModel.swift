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

    /// 扫码登录 client(复用已带 bearer 的 api),供账户页拉起扫码授权。
    var scanLogin: ScanLoginClient { ScanLoginClient(api: api) }

    func load() async {
        do {
            async let meRequest: MeResponse = api.send("/me")
            async let usageRequest: UsageResponse = api.send("/me/usage")
            let (me, usage) = try await (meRequest, usageRequest)
            self.me = me
            self.usage = usage.usage
            errorMessage = nil
        } catch { errorMessage = "账户信息加载失败。" }
    }

    func signOut() async { await signOutAction() }
}

import Foundation
import Observation

@MainActor @Observable
final class AccountModel {
    private(set) var me: MeResponse?
    private(set) var usage: UsageResponse.Usage?
    private(set) var errorMessage: String?
    /// 删号/撤销的进行中标志:pending 时禁用按钮,防重复点击。
    private(set) var isDeletingAccount = false
    private(set) var isRestoring = false
    /// 删号/撤销专属错误,和账户信息加载错误分开展示,避免互相覆盖。
    private(set) var deletionErrorMessage: String?
    private let api: APIClient
    private let signOutAction: () async -> Void

    init(api: APIClient, signOut: @escaping () async -> Void) {
        self.api = api
        signOutAction = signOut
    }

    /// 处于注销冷静期(`deletionScheduledAt` 非空)。
    var isPendingDeletion: Bool { me?.deletionScheduledAt != nil }

    /// 扫码登录 client(复用已带 bearer 的 api),供账户页拉起扫码授权。
    var scanLogin: ScanLoginClient { ScanLoginClient(api: api) }

    func load() async {
        // `/me` 单独拉:冻结态(冷静期)下它仍返回 deletionScheduledAt,是撤销入口的依据,
        // 不能被 `/me/usage` 的失败连坐。usage 走 best-effort,失败不阻断账户信息与恢复入口。
        do {
            me = try await api.send("/me")
            errorMessage = nil
        } catch {
            errorMessage = "账户信息加载失败。"
        }
        usage = try? await (api.send("/me/usage") as UsageResponse).usage
    }

    /// 请求注销:`POST /me/deletion` 进入 7 天冷静期。成功后账户随即被冻结,
    /// 调用方应据返回值登出回登录页(冷静期内重新登录可撤销)。
    func requestDeletion() async -> Bool {
        guard !isDeletingAccount else { return false }
        isDeletingAccount = true
        deletionErrorMessage = nil
        defer { isDeletingAccount = false }
        do {
            let _: DeletionResponse = try await api.send("/me/deletion", method: "POST")
            return true
        } catch {
            deletionErrorMessage = "注销请求失败,请稍后重试。"
            return false
        }
    }

    /// 撤销注销:`DELETE /me/deletion` 恢复账户(该路由不受冻结门禁拦截),成功后重载账户信息。
    func cancelDeletion() async {
        guard !isRestoring else { return }
        isRestoring = true
        deletionErrorMessage = nil
        defer { isRestoring = false }
        do {
            let _: EmptyResponse = try await api.send("/me/deletion", method: "DELETE")
            await load()
        } catch {
            deletionErrorMessage = "撤销注销失败,请稍后重试。"
        }
    }

    func signOut() async { await signOutAction() }
}

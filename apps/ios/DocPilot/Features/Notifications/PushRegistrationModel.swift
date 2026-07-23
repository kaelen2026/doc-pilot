import Foundation
import Observation
import UIKit
import UserNotifications

/// 远程推送注册的协调器。生命周期跨整个 App(由 `AppDelegate` 持有),因为 APNS device
/// token 与登录会话到达的先后顺序不确定,需要在两者都就绪时才能上报后端。
///
/// 排序竞态的处理:token 可能先于登录到达,登录也可能先于 token 到达。本模型把「最新
/// token」与「已鉴权 client」各自缓存,任一方到位后都调用 `registerIfReady()`——只有两者
/// 齐备才真正 POST。后端 upsert 幂等,故每次启动/登录重复注册无副作用。
@MainActor @Observable
final class PushRegistrationModel {
    /// 最近一次从 APNS 拿到的 device token(小写十六进制)。
    private var latestToken: String?
    /// 登录后注入的、带 Bearer 的注册 client;退出登录时清空。
    private var client: PushClient?
    /// 权限申请是一次性的:避免 `.task` 在视图重建后重复弹窗(iOS 26 SwiftUI 坑)。
    private var didRequestAuthorization = false

    /// 由 `AppDelegate` 在 `didRegisterForRemoteNotificationsWithDeviceToken` 回调里调用(主线程)。
    func updateDeviceToken(_ hex: String) {
        latestToken = hex
        Task { await registerIfReady() }
    }

    /// 登录成功后由 `WorkspaceShell` 注入已鉴权的 client,并触发权限申请 + 注册。
    /// 重复调用安全:权限申请有一次性 guard,注册幂等。
    func activate(client: PushClient) async {
        self.client = client
        await requestAuthorizationIfNeeded()
        await registerIfReady()
    }

    /// 退出登录:best-effort 注销当前 token 并清空 client。
    func deactivate() async {
        let token = latestToken
        let pending = client
        client = nil
        if let token, let pending {
            try? await pending.unregister(token: token)
        }
    }

    /// 申请通知授权(alert/badge/sound),获准后在主线程注册远程通知。
    private func requestAuthorizationIfNeeded() async {
        guard !didRequestAuthorization else { return }
        didRequestAuthorization = true
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        guard granted else { return }
        // 触发 APNS 注册;token 稍后经 AppDelegate 回到 updateDeviceToken(_:)。
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// token 与 client 都就绪时才上报;任一缺失则静默等待另一半。
    private func registerIfReady() async {
        guard let client, let token = latestToken else { return }
        try? await client.register(token: token, environment: .current)
    }
}

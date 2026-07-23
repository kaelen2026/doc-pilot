import UIKit
import UserNotifications

/// 通过 `@UIApplicationDelegateAdaptor` 挂到纯 SwiftUI 生命周期上,只负责远程推送的系统回调:
/// 设置 `UNUserNotificationCenter` 代理、接收/转发 APNS device token、前台横幅展示。
/// 具体的权限申请与后端上报由 `PushRegistrationModel` 承担(它需要 Bearer,故在登录后触发)。
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    /// 跨 App 生命周期存活的推送协调器,登录后由 SwiftUI 侧注入 client。
    let pushRegistration = PushRegistrationModel()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        // Data → 小写十六进制,无空格/方括号,匹配后端契约。
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        pushRegistration.updateDeviceToken(hex)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // 模拟器无 APNS、真机缺 DEVELOPMENT_TEAM/描述文件时会走这里,记录即可,不阻断 App。
        print("[Push] 远程通知注册失败: \(error.localizedDescription)")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    /// 前台也以横幅+声音+角标展示推送,便于管理员验证测试推送已送达。
    /// 该代理回调在非主 actor 上下文触发,标 nonisolated 以避开跨 actor 传非 Sendable 参数;
    /// 方法体只返回常量选项,无需接触 MainActor 状态。
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}

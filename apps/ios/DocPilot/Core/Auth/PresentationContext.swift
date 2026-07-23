import UIKit

/// 从 SwiftUI 世界取当前前台的 rootViewController,供需要 UIKit presenting VC 的 SDK 使用
/// (如 GoogleSignIn 的 `signIn(withPresenting:)`)。
enum PresentationContext {
    /// 遍历 connectedScenes,优先取 `foregroundActive` 的 window scene 的 keyWindow;
    /// iOS 26 多 scene 下以前台活跃 scene 为准,取不到再回退首个 window scene / 首个 window。
    @MainActor static func rootViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        return window?.rootViewController
    }
}

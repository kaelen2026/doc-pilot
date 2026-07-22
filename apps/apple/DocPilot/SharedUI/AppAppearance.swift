import SwiftUI

/// 一处配置全屏生效的原生外观:把导航栏标题换成衬线(New York),对齐 web 的
/// display 衬线气质。iOS 的 UINavigationBar 标题字体不吃 SwiftUI 修饰器,只能走
/// UIKit appearance;macOS 的标题栏无对应开关,视图内标题另用 DesignTokens.display。
enum AppAppearance {
    static func apply() {
#if canImport(UIKit) && !os(watchOS)
        let inkColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.894, green: 0.882, blue: 0.847, alpha: 1) // ink dark #E4E1D8
                : UIColor(red: 0.149, green: 0.125, blue: 0.110, alpha: 1) // ink light #26201C
        }
        func serif(_ size: CGFloat, _ weight: UIFont.Weight) -> UIFont {
            let base = UIFont.systemFont(ofSize: size, weight: weight)
            guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
            return UIFont(descriptor: descriptor, size: size)
        }

        let appearance = UINavigationBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.largeTitleTextAttributes = [
            .font: serif(34, .semibold), .foregroundColor: inkColor,
        ]
        appearance.titleTextAttributes = [
            .font: serif(17, .semibold), .foregroundColor: inkColor,
        ]
        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
#endif
    }
}

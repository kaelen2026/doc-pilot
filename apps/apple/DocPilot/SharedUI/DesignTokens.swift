import SwiftUI

/// 墨水纸设计 token,与 web 端 `apps/web/app/globals.css @theme` 对齐:
/// 值由 web 的 OKLCH 精确转换为 sRGB(见 PR 描述),明暗两套一一对应,
/// 改视觉先动 web 的 @theme 再回搬,保持前后端一致。
enum DesignTokens {
    // 纸:背景台阶(相邻表面明度差 >= 4%,或抬升面配最小阴影)
    static let paper = Color(light: 0xF8F6F2, dark: 0x171612)
    static let paperRaised = Color(light: 0xFEFDFC, dark: 0x22201C)
    static let paperSunken = Color(light: 0xEFECE8, dark: 0x0F0E0B)
    static let hairline = Color(light: 0xDAD7D1, dark: 0x35332D)

    // 墨:文字层级
    static let ink = Color(light: 0x26201C, dark: 0xE4E1D8)
    static let inkSoft = Color(light: 0x524C47, dark: 0xAEABA2)
    static let inkFaint = Color(light: 0x7C7672, dark: 0x77746D)

    // 朱红印章:只做强调,不大面积填充
    static let seal = Color(light: 0xC3321A, dark: 0xE05C45)
    static let sealDeep = Color(light: 0xA32510, dark: 0xF87962)

    /// 旧引用别名 —— 全局强调色即朱红印章色。
    static let accent = seal
    /// 次级文字旧引用别名。
    static let mutedInk = inkSoft

    // 圆角:与 web --radius-sm/md/lg(4/8/12)一致
    static let radiusSm: CGFloat = 4
    static let radiusMd: CGFloat = 8
    static let radiusLg: CGFloat = 12
    static let cornerRadius: CGFloat = radiusLg

    // 间距刻度
    static let spacingSm: CGFloat = 8
    static let spacing: CGFloat = 16
    static let spacingLg: CGFloat = 24

    /// Display 衬线字体:对齐 web 的 Literata/宋体系。Apple 系统衬线为 New York,
    /// 拉丁走 New York、中文自动落宋体(Songti SC),无需打包字体文件。
    static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

extension View {
    /// 铺纸底并隐藏系统默认 scroll/form 灰底,露出墨水纸背景。
    func paperBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(DesignTokens.paper)
    }

    /// 抬升纸面卡片:与纸底明度差 >= 4%,配发丝描边,承接分组内容。
    func cardSurface(cornerRadius: CGFloat = DesignTokens.radiusLg) -> some View {
        background(
            DesignTokens.paperRaised,
            in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(DesignTokens.hairline, lineWidth: 1)
        )
    }
}

private extension Color {
    init(light: UInt, dark: UInt) {
        self.init(light: Color(hex: light), dark: Color(hex: dark))
    }

    init(hex: UInt) {
        self.init(
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255
        )
    }

    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

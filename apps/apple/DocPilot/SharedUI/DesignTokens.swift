import SwiftUI

enum DesignTokens {
    static let paper = Color(light: 0xF8F5ED, dark: 0x171612)
    static let ink = Color(light: 0x29261F, dark: 0xEEE9DD)
    static let mutedInk = Color(light: 0x756E61, dark: 0xAAA294)
    static let accent = Color(light: 0x8C4B32, dark: 0xD88A6A)
    static let spacing: CGFloat = 16
    static let cornerRadius: CGFloat = 12
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
#if os(macOS)
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(dark) : NSColor(light)
        })
#else
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
#endif
    }
}

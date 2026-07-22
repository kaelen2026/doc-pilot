import SwiftUI

/// 设置项持久化键(集中于此,避免各处散写字符串)。
enum SettingsKeys {
    static let appearance = "settings.appearance"
    static let liveNotifications = "settings.liveNotifications"
}

/// 外观偏好:跟随系统 / 浅色 / 深色。默认跟随系统。
enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "跟随系统"
        case .light: "浅色"
        case .dark: "深色"
        }
    }

    /// nil = 跟随系统。
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    static func from(_ raw: String) -> AppearancePreference {
        AppearancePreference(rawValue: raw) ?? .system
    }
}

@MainActor @Observable
final class SettingsModel {
    private let cache = DocumentCache()
    private(set) var cacheBytes: Int64 = 0
    private(set) var isClearingCache = false

    /// 应用版本号,如 "0.1.0 (1)"。
    var versionText: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "-"
        let build = info?["CFBundleVersion"] as? String ?? "-"
        return "\(short) (\(build))"
    }

    /// 后端服务地址(host,取自 Info.plist 的 API_BASE_URL)。
    var apiHost: String {
        (Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String)
            .flatMap { URL(string: $0)?.host } ?? "未配置"
    }

    var cacheText: String {
        ByteCountFormatter.string(fromByteCount: cacheBytes, countStyle: .file)
    }

    func refreshCacheSize() async {
        cacheBytes = await cache.totalSize()
    }

    func clearCache() async {
        isClearingCache = true
        defer { isClearingCache = false }
        try? await cache.clear()
        await refreshCacheSize()
    }
}

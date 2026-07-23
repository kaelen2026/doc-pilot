import Foundation

/// 账户注销相关的纯展示逻辑,与网络/框架解耦,便于单测。
enum AccountDeletion {
    /// 冷静期到期(数据被永久删除)日期的展示文案,例:「2026年7月30日」。
    /// locale/timeZone 显式可注入以便测试确定性;线上走当前区域与时区。
    static func scheduledDateText(
        _ date: Date,
        locale: Locale = .current,
        timeZone: TimeZone = .current
    ) -> String {
        var style = Date.FormatStyle(date: .long, time: .omitted)
        style.locale = locale
        style.timeZone = timeZone
        return date.formatted(style)
    }
}

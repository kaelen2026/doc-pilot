import Foundation
import Observation
import UserNotifications

@MainActor @Observable
final class NotificationsModel {
    private(set) var items: [NotificationItem] = []
    private(set) var unreadCount = 0
    private(set) var errorMessage: String?
    private let api: APIClient
    private let streamClient: NotificationsClient

    init(api: APIClient) {
        self.api = api
        streamClient = NotificationsClient(api: api)
    }

    func load() async {
        do {
            async let list: NotificationsResponse = api.send("/notifications?limit=50")
            async let count: UnreadCountResponse = api.send("/notifications/unread-count")
            let (loaded, unread) = try await (list, count)
            items = loaded.notifications
            setUnread(unread.count)
            errorMessage = nil
        } catch { errorMessage = "通知加载失败。" }
    }

    func markAllRead() async {
        do {
            let _: UpdatedCountResponse = try await api.send("/notifications/read-all", method: "POST")
            items = items.map { item in
                NotificationItem(id: item.id, type: item.type, title: item.title, body: item.body,
                                 resourceType: item.resourceType, resourceId: item.resourceId,
                                 read: true, createdAt: item.createdAt)
            }
            setUnread(0)
        } catch { errorMessage = "无法标记为已读。" }
    }

    func run() async {
        await load()
        while !Task.isCancelled {
            do {
                for try await update in streamClient.stream() {
                    switch update {
                    case .snapshot(let count): setUnread(count)
                    case .created(let item):
                        items.removeAll { $0.id == item.id }
                        items.insert(item, at: 0)
                        if !item.read { setUnread(unreadCount + 1) }
                    }
                }
            } catch { errorMessage = "实时通知已断开，正在重连。" }
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
        }
    }

    /// 未读数的唯一写入口:同步内存态与系统 app 图标角标(iOS 26 `setBadgeCount`)。
    /// 角标恒等于未读数——load()/markAllRead()/stream 快照与新增四处都经此收敛,
    /// 避免角标只增不减(推送增设后打开 app / 点推送即被真实未读数覆盖清除)。
    private func setUnread(_ n: Int) {
        unreadCount = n
        // setBadgeCount 是 async throwing;角标同步失败无需打扰用户,忽略错误。
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(n) }
    }
}

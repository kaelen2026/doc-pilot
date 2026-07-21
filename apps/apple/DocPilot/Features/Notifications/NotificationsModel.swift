import Foundation
import Observation

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
            async let list: NotificationsResponse = api.send("/api/v1/notifications?limit=50")
            async let count: UnreadCountResponse = api.send("/api/v1/notifications/unread-count")
            let (loaded, unread) = try await (list, count)
            items = loaded.notifications
            unreadCount = unread.count
            errorMessage = nil
        } catch { errorMessage = "通知加载失败。" }
    }

    func markAllRead() async {
        do {
            let _: UpdatedCountResponse = try await api.send("/api/v1/notifications/read-all", method: "POST")
            items = items.map { item in
                NotificationItem(id: item.id, type: item.type, title: item.title, body: item.body,
                                 resourceType: item.resourceType, resourceId: item.resourceId,
                                 read: true, createdAt: item.createdAt)
            }
            unreadCount = 0
        } catch { errorMessage = "无法标记为已读。" }
    }

    func run() async {
        await load()
        while !Task.isCancelled {
            do {
                for try await update in streamClient.stream() {
                    switch update {
                    case .snapshot(let count): unreadCount = count
                    case .created(let item):
                        items.removeAll { $0.id == item.id }
                        items.insert(item, at: 0)
                        if !item.read { unreadCount += 1 }
                    }
                }
            } catch { errorMessage = "实时通知已断开，正在重连。" }
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
        }
    }
}

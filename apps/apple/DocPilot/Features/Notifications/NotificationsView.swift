import SwiftUI

struct NotificationsView: View {
    @Bindable var model: NotificationsModel
    let openDocument: (String) -> Void
    @AppStorage(SettingsKeys.liveNotifications) private var liveNotifications = true

    var body: some View {
        Group {
            if model.items.isEmpty {
                ContentUnavailableView("暂无通知", systemImage: "bell")
                    .background(DesignTokens.paper)
            } else {
                List(model.items) { item in
                    Button { openDocument(item.resourceId) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: item.type == "document.ready" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .font(.title3)
                                .foregroundStyle(item.type == "document.ready" ? DesignTokens.inkSoft : DesignTokens.seal)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                    .font(.headline)
                                    .foregroundStyle(DesignTokens.ink)
                                Text(item.body)
                                    .font(.subheadline)
                                    .foregroundStyle(DesignTokens.inkSoft)
                            }
                            Spacer(minLength: 8)
                            if !item.read { Circle().fill(DesignTokens.seal).frame(width: 8, height: 8) }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(DesignTokens.paper)
                    .listRowSeparatorTint(DesignTokens.hairline)
                }
                .listStyle(.plain)
                .paperBackground()
            }
        }
        .navigationTitle("通知")
        .toolbar { if model.unreadCount > 0 { Button("全部已读") { Task { await model.markAllRead() } } } }
        // 实时通知开关(设置页)决定是否保持 SSE 长连接;关闭则仅进页时拉取一次。
        .task(id: liveNotifications) {
            if liveNotifications { await model.run() } else { await model.load() }
        }
        .refreshable { await model.load() }
    }
}

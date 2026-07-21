import SwiftUI

struct NotificationsView: View {
    @Bindable var model: NotificationsModel
    let openDocument: (String) -> Void

    var body: some View {
        Group {
            if model.items.isEmpty {
                ContentUnavailableView("暂无通知", systemImage: "bell")
            } else {
                List(model.items) { item in
                    Button { openDocument(item.resourceId) } label: {
                        HStack(alignment: .top) {
                            Image(systemName: item.type == "document.ready" ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundStyle(item.type == "document.ready" ? .green : .orange)
                            VStack(alignment: .leading) {
                                Text(item.title).font(.headline)
                                Text(item.body).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if !item.read { Circle().fill(DesignTokens.accent).frame(width: 8, height: 8) }
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("通知")
        .toolbar { if model.unreadCount > 0 { Button("全部已读") { Task { await model.markAllRead() } } } }
        .task { await model.run() }
        .refreshable { await model.load() }
    }
}

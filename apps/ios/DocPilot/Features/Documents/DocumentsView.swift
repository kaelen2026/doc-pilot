import SwiftUI

struct DocumentsView: View {
    @Bindable var model: DocumentsModel
    @Bindable var searchModel: SearchModel
    @Bindable var notificationsModel: NotificationsModel
    let openDocument: (String) -> Void
    @AppStorage(SettingsKeys.liveNotifications) private var liveNotifications = true
    @State private var showNotifications = false

    // 顶部搜索走后端全文检索;达 2 字符阈值(与 SearchModel 口径一致)即以结果区替换文档列表。
    private var isSearching: Bool {
        searchModel.query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    var body: some View {
        Group {
            if isSearching {
                SearchResultsView(model: searchModel, openDocument: openDocument)
            } else {
                documentList
            }
        }
        .navigationTitle("文档")
        .searchable(text: $searchModel.query, prompt: "搜索文档内容")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNotifications = true } label: {
                    Image(systemName: notificationsModel.unreadCount > 0 ? "bell.badge" : "bell")
                }
                .accessibilityIdentifier("documents.notifications")
                .accessibilityLabel(
                    notificationsModel.unreadCount > 0
                        ? "通知,\(notificationsModel.unreadCount) 条未读" : "通知"
                )
            }
        }
        .navigationDestination(isPresented: $showNotifications) {
            NotificationsView(model: notificationsModel) { id in
                showNotifications = false
                openDocument(id)
            }
        }
        .task(id: searchModel.query) { await searchModel.search() }
        .task {
            await model.load()
            // 截图/联调用:-openFirstDocument 载入后自动打开首个文档(受启动参数保护,生产无副作用)。
            if ProcessInfo.processInfo.arguments.contains("-openFirstDocument"),
               model.selectedDocumentID == nil {
                model.selectedDocumentID = model.documents.first?.id
            }
        }
        .task(id: model.shouldPoll) { if model.shouldPoll { await model.pollWhileNeeded() } }
        // 铃铛徽标需在文档页也保持最新:实时开则挂 SSE 长连接,关闭则进页拉取一次。
        .task(id: liveNotifications) {
            if liveNotifications { await notificationsModel.run() } else { await notificationsModel.load() }
        }
    }

    @ViewBuilder private var documentList: some View {
        switch model.state {
        case .idle where model.documents.isEmpty,
             .loading where model.documents.isEmpty:
            ProgressView("正在加载文档…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(DesignTokens.paper)
        case .failed where model.documents.isEmpty:
            ContentUnavailableView {
                Label("无法加载文档", systemImage: "wifi.exclamationmark")
            } actions: {
                Button("重试") { Task { await model.load() } }
                    .buttonStyle(.glass)
            }
            .background(DesignTokens.paper)
        default:
            if model.documents.isEmpty {
                ContentUnavailableView("还没有文档", systemImage: "doc.badge.plus", description: Text("点底部「上传」选择 PDF,开始阅读和问答。"))
                    .background(DesignTokens.paper)
            } else {
                List(model.documents, selection: $model.selectedDocumentID) { document in
                    DocumentRow(document: document)
                        .tag(document.id)
                        .listRowBackground(DesignTokens.paper)
                        .listRowSeparatorTint(DesignTokens.hairline)
                }
                .listStyle(.plain)
                .paperBackground()
                .refreshable { await model.load() }
            }
        }
    }
}

private struct DocumentRow: View {
    let document: DocumentItem

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "doc.text.fill")
                .font(.title3)
                .foregroundStyle(DesignTokens.seal)
                .frame(width: 40, height: 40)
                .background(DesignTokens.paperSunken, in: RoundedRectangle(cornerRadius: DesignTokens.radiusMd))
            VStack(alignment: .leading, spacing: 4) {
                Text(document.title)
                    .font(.headline)
                    .foregroundStyle(DesignTokens.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Circle().fill(statusColor).frame(width: 6, height: 6)
                    Text(statusText)
                    if let pageCount = document.pageCount { Text("· \(pageCount) 页") }
                }
                .font(.caption)
                .foregroundStyle(DesignTokens.inkFaint)
            }
            Spacer(minLength: 8)
            if document.status.isInFlight {
                ProgressView(value: Double(document.progress), total: 100)
                    .frame(width: 44)
            }
        }
        .padding(.vertical, 6)
        .accessibilityIdentifier("document.\(document.id)")
    }

    private var statusText: String {
        switch document.status {
        case .ready, .partiallyReady: "可阅读"
        case .failed: "处理失败"
        case .pendingUpload, .uploaded: "正在上传"
        case .queued, .processing: "正在处理"
        case .deleting, .deleted: "正在删除"
        }
    }

    private var statusColor: Color {
        switch document.status {
        case .ready, .partiallyReady: DesignTokens.inkSoft
        case .failed: DesignTokens.seal
        default: DesignTokens.inkFaint
        }
    }
}

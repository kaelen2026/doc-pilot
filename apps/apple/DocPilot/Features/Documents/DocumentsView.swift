import SwiftUI
import UniformTypeIdentifiers

struct DocumentsView: View {
    @Bindable var model: DocumentsModel
    @State private var importing = false

    var body: some View {
        Group {
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
                    ContentUnavailableView("还没有文档", systemImage: "doc.badge.plus", description: Text("上传 PDF 开始阅读和问答。"))
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
        .navigationTitle("文档")
        .toolbar {
            Button { importing = true } label: { Label("上传 PDF", systemImage: "plus") }
                .accessibilityIdentifier("documents.upload")
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            if case .success(let url) = result { Task { await model.upload(url) } }
        }
        .task {
            await model.load()
            // 截图/联调用:-openFirstDocument 载入后自动打开首个文档(受启动参数保护,生产无副作用)。
            if ProcessInfo.processInfo.arguments.contains("-openFirstDocument"),
               model.selectedDocumentID == nil {
                model.selectedDocumentID = model.documents.first?.id
            }
        }
        .task(id: model.shouldPoll) { if model.shouldPoll { await model.pollWhileNeeded() } }
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

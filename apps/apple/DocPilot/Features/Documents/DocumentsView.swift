import SwiftUI
import UniformTypeIdentifiers

struct DocumentsView: View {
    @Bindable var model: DocumentsModel
    @State private var importing = false

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading where model.documents.isEmpty:
                ProgressView("正在加载文档…")
            case .failed where model.documents.isEmpty:
                ContentUnavailableView {
                    Label("无法加载文档", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("重试") { Task { await model.load() } }
                }
            default:
                if model.documents.isEmpty {
                    ContentUnavailableView("还没有文档", systemImage: "doc.badge.plus", description: Text("上传 PDF 开始阅读和问答。"))
                } else {
                    List(model.documents, selection: $model.selectedDocumentID) { document in
                        DocumentRow(document: document).tag(document.id)
                    }
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
        .task { await model.load() }
        .task(id: model.shouldPoll) { if model.shouldPoll { await model.pollWhileNeeded() } }
    }
}

private struct DocumentRow: View {
    let document: DocumentItem

    var body: some View {
        HStack(spacing: DesignTokens.spacing) {
            Image(systemName: "doc.text").foregroundStyle(DesignTokens.accent)
            VStack(alignment: .leading, spacing: 4) {
                Text(document.title).lineLimit(1)
                HStack {
                    Text(statusText).foregroundStyle(DesignTokens.mutedInk)
                    if let pageCount = document.pageCount { Text("\(pageCount) 页") }
                }
                .font(.caption)
            }
            Spacer()
            if document.status.isInFlight { ProgressView(value: Double(document.progress), total: 100) }
        }
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
}

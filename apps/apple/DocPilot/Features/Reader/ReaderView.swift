import SwiftUI
import SwiftData

struct ReaderView: View {
    @State private var model: ReaderModel
    @Environment(\.modelContext) private var modelContext
    @State private var highlights: [Highlight] = []
    @State private var selection: (page: Int, bounds: CGRect, text: String)?
    private let documentID: String
    private let userID: String

    init(documentID: String, userID: String, api: APIClient) {
        self.documentID = documentID
        self.userID = userID
        _model = State(initialValue: ReaderModel(documentID: documentID, userID: userID, api: api))
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading: ProgressView("正在准备 PDF…")
            case .failed:
                ContentUnavailableView { Label("无法打开 PDF", systemImage: "doc.badge.ellipsis") }
                actions: { Button("重试") { Task { await model.load() } } }
            case .loaded(let url):
                PDFKitView(url: url, pageIndex: $model.pageIndex, highlights: highlights) {
                    selection = (page: $0, bounds: $1, text: $2)
                }
            }
        }
        .toolbar {
            Text("第 \(model.pageIndex + 1) 页").monospacedDigit()
            Button("高亮") { addHighlight() }.disabled(selection == nil)
                .accessibilityIdentifier("reader.highlight")
        }
        .task {
            highlights = (try? HighlightStore(context: modelContext).list(
                userID: userID, documentID: documentID
            )) ?? []
            await model.load()
        }
    }

    private func addHighlight() {
        guard let selection else { return }
        let item = Highlight(
            userID: userID, documentID: documentID, pageIndex: selection.page,
            bounds: selection.bounds, text: selection.text
        )
        try? HighlightStore(context: modelContext).add(item)
        highlights.append(item)
        self.selection = nil
    }
}

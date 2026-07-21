import SwiftUI

struct SearchView: View {
    @Bindable var model: SearchModel
    let openDocument: (String) -> Void

    var body: some View {
        Group {
            if model.query.trimmingCharacters(in: .whitespaces).count < 2 {
                ContentUnavailableView("搜索文档", systemImage: "magnifyingglass", description: Text("输入至少两个字符。"))
            } else if model.isLoading && model.results.isEmpty {
                ProgressView("正在搜索…")
            } else if model.results.isEmpty {
                ContentUnavailableView.search(text: model.query)
            } else {
                List(model.results) { result in
                    Button { openDocument(result.documentId) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(result.title).font(.headline)
                            ForEach(result.passages.prefix(2)) { passage in
                                Text(passage.content).lineLimit(3).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("打开文档 \(result.title)")
                }
            }
        }
        .navigationTitle("搜索")
        .searchable(text: $model.query, prompt: "搜索文档内容")
        .task(id: model.query) { await model.search() }
        .overlay(alignment: .top) { if let message = model.errorMessage { Text(message).foregroundStyle(.red) } }
    }
}

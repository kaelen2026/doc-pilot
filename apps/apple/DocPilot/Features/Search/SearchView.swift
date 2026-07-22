import SwiftUI

struct SearchView: View {
    @Bindable var model: SearchModel
    let openDocument: (String) -> Void

    var body: some View {
        Group {
            if model.query.trimmingCharacters(in: .whitespaces).count < 2 {
                ContentUnavailableView("搜索文档", systemImage: "magnifyingglass", description: Text("输入至少两个字符。"))
                    .background(DesignTokens.paper)
            } else if model.isLoading && model.results.isEmpty {
                ProgressView("正在搜索…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(DesignTokens.paper)
            } else if model.results.isEmpty {
                ContentUnavailableView.search(text: model.query)
                    .background(DesignTokens.paper)
            } else {
                List(model.results) { result in
                    Button { openDocument(result.documentId) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(result.title)
                                .font(.headline)
                                .foregroundStyle(DesignTokens.ink)
                            ForEach(result.passages.prefix(2)) { passage in
                                Text(passage.content)
                                    .font(.subheadline)
                                    .lineLimit(3)
                                    .foregroundStyle(DesignTokens.inkSoft)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(DesignTokens.paper)
                    .listRowSeparatorTint(DesignTokens.hairline)
                    .accessibilityLabel("打开文档 \(result.title)")
                }
                .listStyle(.plain)
                .paperBackground()
            }
        }
        .navigationTitle("搜索")
        .searchable(text: $model.query, prompt: "搜索文档内容")
        .task(id: model.query) { await model.search() }
        .overlay(alignment: .top) {
            if let message = model.errorMessage {
                Text(message).font(.callout).foregroundStyle(DesignTokens.seal)
            }
        }
    }
}

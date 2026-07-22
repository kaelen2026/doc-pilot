import SwiftUI

/// 文档页顶部搜索的结果区:后端全文检索命中(段落)。自身不带 `.searchable`/标题,
/// 由宿主(`DocumentsView`)在 query 达阈值时渲染;`query < 2` 的空态由宿主兜。
struct SearchResultsView: View {
    @Bindable var model: SearchModel
    let openDocument: (String) -> Void

    var body: some View {
        Group {
            if model.isLoading && model.results.isEmpty {
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
        .overlay(alignment: .top) {
            if let message = model.errorMessage {
                Text(message).font(.callout).foregroundStyle(DesignTokens.seal)
            }
        }
    }
}

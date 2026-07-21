import SwiftUI

struct ChatView: View {
    @State private var model: ChatModel
    let onCitation: (Int) -> Void

    init(documentID: String, api: APIClient, onCitation: @escaping (Int) -> Void) {
        _model = State(initialValue: ChatModel(documentID: documentID, client: ChatClient(api: api)))
        self.onCitation = onCitation
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: DesignTokens.spacing) {
                    if model.hasMore { Button("加载更早") { Task { await model.loadEarlier() } } }
                    ForEach(model.messages) { message in MessageView(message: message, onCitation: onCitation) }
                    if !model.streamingText.isEmpty {
                        Text((try? AttributedString(markdown: model.streamingText)) ?? AttributedString(model.streamingText))
                            .textSelection(.enabled)
                            .padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if let error = model.errorMessage { Text(error).foregroundStyle(.red) }
                }
                .padding()
            }
            Divider()
            HStack(alignment: .bottom) {
                TextField("询问这份文档…", text: $model.question, axis: .vertical)
                    .lineLimit(1...5).accessibilityIdentifier("chat.question")
                Button { Task { await model.send() } } label: { Image(systemName: "arrow.up.circle.fill") }
                    .disabled(model.isSending || model.question.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("chat.send")
            }
            .padding()
        }
        .task { await model.load() }
    }
}

private struct MessageView: View {
    let message: ChatMessage
    let onCitation: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message.role == "user" ? "你" : "DocPilot").font(.caption).foregroundStyle(.secondary)
            Text((try? AttributedString(markdown: message.content)) ?? AttributedString(message.content))
                .textSelection(.enabled)
            if !message.citations.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(message.citations) { citation in
                            Button("第 \((citation.pageStart ?? 0) + 1) 页") {
                                onCitation(citation.pageStart ?? 0)
                            }
                            .buttonStyle(.bordered)
                            .help(citation.quote)
                        }
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(message.role == "user" ? DesignTokens.accent.opacity(0.12) : DesignTokens.paper)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.cornerRadius))
    }
}

import SwiftUI

struct ChatView: View {
    @State private var model: ChatModel
    let onCitation: (Int) -> Void

    init(documentID: String, api: APIClient, onCitation: @escaping (Int) -> Void) {
        _model = State(initialValue: ChatModel(documentID: documentID, client: ChatClient(api: api)))
        self.onCitation = onCitation
    }

    private var canSend: Bool {
        !model.isSending && !model.question.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: DesignTokens.spacing) {
                    if model.hasMore {
                        Button("加载更早") { Task { await model.loadEarlier() } }
                            .font(.caption)
                            .tint(DesignTokens.seal)
                            .frame(maxWidth: .infinity)
                    }
                    ForEach(model.messages) { message in MessageView(message: message, onCitation: onCitation) }
                    if !model.streamingText.isEmpty {
                        MessageBubble(role: "assistant") {
                            Text((try? AttributedString(markdown: model.streamingText)) ?? AttributedString(model.streamingText))
                                .textSelection(.enabled)
                        }
                    }
                    if let error = model.errorMessage {
                        Text(error).font(.callout).foregroundStyle(DesignTokens.seal)
                    }
                }
                .padding()
            }
            inputBar
        }
        .background(DesignTokens.paper)
        .task { await model.load() }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("询问这份文档…", text: $model.question, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .foregroundStyle(DesignTokens.ink)
                .lineLimit(1...5)
                .accessibilityIdentifier("chat.question")
            Button { Task { await model.send() } } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DesignTokens.paperRaised)
                    .frame(width: 32, height: 32)
                    .background(canSend ? DesignTokens.seal : DesignTokens.inkFaint, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .accessibilityIdentifier("chat.send")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: 24, style: .continuous))
        .padding(.horizontal)
        .padding(.bottom, 8)
    }
}

/// 气泡外壳:助手 = 抬升纸面 + 发丝描边(与纸底明度差 >= 4%,不再隐形);
/// 用户 = 朱红淡染。流式与落定态共用同一材质,切换不跳。
private struct MessageBubble<Content: View>: View {
    let role: String
    @ViewBuilder let content: Content

    private var isUser: Bool { role == "user" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(isUser ? "你" : "DocPilot")
                .font(.caption.weight(.medium))
                .foregroundStyle(DesignTokens.inkFaint)
            content
                .font(.body)
                .foregroundStyle(DesignTokens.ink)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            isUser ? DesignTokens.seal.opacity(0.10) : DesignTokens.paperRaised,
            in: RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
                .stroke(isUser ? DesignTokens.seal.opacity(0.20) : DesignTokens.hairline, lineWidth: 1)
        )
    }
}

private struct MessageView: View {
    let message: ChatMessage
    let onCitation: (Int) -> Void

    var body: some View {
        MessageBubble(role: message.role) {
            VStack(alignment: .leading, spacing: 10) {
                Text((try? AttributedString(markdown: message.content)) ?? AttributedString(message.content))
                    .textSelection(.enabled)
                if !message.citations.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 6) {
                            ForEach(message.citations) { citation in
                                Button("第 \((citation.pageStart ?? 0) + 1) 页") {
                                    onCitation(citation.pageStart ?? 0)
                                }
                                .font(.caption)
                                .buttonStyle(.bordered)
                                .tint(DesignTokens.seal)
                                .help(citation.quote)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
    }
}

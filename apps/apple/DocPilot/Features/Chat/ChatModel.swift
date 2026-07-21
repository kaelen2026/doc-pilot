import Foundation
import Observation

@MainActor @Observable
final class ChatModel {
    private(set) var messages: [ChatMessage] = []
    private(set) var streamingText = ""
    private(set) var isSending = false
    private(set) var errorMessage: String?
    var question = ""
    var hasMore = false
    private var conversationID: String?
    private var limit = 30
    private let documentID: String
    private let client: ChatClient

    init(documentID: String, client: ChatClient) { self.documentID = documentID; self.client = client }

    func load() async {
        do {
            let conversation = try await client.ensureConversation(documentID: documentID)
            conversationID = conversation.id
            let response = try await client.messages(conversationID: conversation.id, limit: limit)
            messages = response.messages
            hasMore = response.hasMore
        } catch is CancellationError { return }
        catch { errorMessage = "无法加载对话。" }
    }

    func loadEarlier() async { limit = min(limit + 30, 100); await load() }

    func send() async {
        let content = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, content.count <= 4000, !isSending, let conversationID else { return }
        isSending = true; errorMessage = nil; streamingText = ""; question = ""
        let requestID = UUID().uuidString
        do {
            for try await event in client.stream(
                conversationID: conversationID, content: content, clientRequestID: requestID
            ) {
                switch event {
                case .delta(let text): streamingText += text
                case .failed(let code): errorMessage = "生成失败（\(code)），可重试。"
                default: break
                }
            }
            await load()
        } catch { errorMessage = "连接中断，请重试。" }
        streamingText = ""; isSending = false
    }
}

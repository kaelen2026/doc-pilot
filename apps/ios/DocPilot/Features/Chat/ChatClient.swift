import Foundation

struct ChatClient: Sendable {
    let api: APIClient

    func ensureConversation(documentID: String) async throws -> Conversation {
        let encoded = documentID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? documentID
        let existing: ConversationsResponse = try await api.send("/conversations?documentId=\(encoded)")
        if let first = existing.conversations.first { return first }
        struct Body: Encodable, Sendable { let documentId: String }
        struct Response: Decodable, Sendable { let conversation: Conversation }
        let created: Response = try await api.send(
            "/conversations", method: "POST", body: Body(documentId: documentID)
        )
        return created.conversation
    }

    func messages(conversationID: String, limit: Int = 30) async throws -> MessagesResponse {
        try await api.send("/conversations/\(conversationID)/messages?limit=\(limit)")
    }

    func stream(conversationID: String, content: String, clientRequestID: String) -> AsyncThrowingStream<ChatStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    guard let url = URL(
                        string: "/conversations/\(conversationID)/messages", relativeTo: api.baseURL
                    ) else { throw APIError.invalidResponse }
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream, application/json", forHTTPHeaderField: "Accept")
                    if let token = await api.token?() { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
                    request.httpBody = try JSONEncoder().encode(SubmitBody(content: content, clientRequestId: clientRequestID))
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw APIError.invalidResponse }
                    if http.value(forHTTPHeaderField: "Content-Type")?.contains("application/json") == true {
                        for try await _ in bytes { }
                        continuation.yield(.completed)
                    } else {
                        var parser = SSEParser()
                        for try await line in bytes.lines {
                            for frame in try parser.feed(Data((line + "\n").utf8)) {
                                if let event = decode(frame) { continuation.yield(event) }
                            }
                        }
                        for frame in try parser.feed(Data("\n".utf8)) {
                            if let event = decode(frame) { continuation.yield(event) }
                        }
                    }
                    continuation.finish()
                } catch is CancellationError { continuation.finish() }
                catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func decode(_ frame: SSEFrame) -> ChatStreamEvent? {
        guard let data = frame.data.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        switch frame.event {
        case "message.started": return (object["messageId"] as? String).map(ChatStreamEvent.started)
        case "retrieval.completed": return .retrieval(object["sourceCount"] as? Int ?? 0)
        case "message.delta": return .delta(object["text"] as? String ?? "")
        case "citation": return .citation(page: object["pageStart"] as? Int)
        case "message.completed": return .completed
        case "message.failed": return .failed(object["errorCode"] as? String ?? "AI_UNKNOWN")
        default: return nil
        }
    }
}

private struct SubmitBody: Encodable, Sendable { let content: String; let clientRequestId: String }

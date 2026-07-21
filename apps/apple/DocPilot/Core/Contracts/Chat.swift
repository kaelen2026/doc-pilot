import Foundation

struct Conversation: Codable, Identifiable, Sendable { let id: String; let documentId: String; let title: String?; let createdAt: Date }
struct ConversationsResponse: Decodable, Sendable { let conversations: [Conversation] }

struct CitationItem: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let chunkId: String
    let quote: String
    let claim: String?
    let pageStart: Int?
    let pageEnd: Int?
    let score: String?
    let position: Int
}

struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let role: String
    let content: String
    let status: String
    let errorCode: String?
    let clientRequestId: String?
    let createdAt: Date
    let citations: [CitationItem]
}

struct MessagesResponse: Decodable, Sendable { let messages: [ChatMessage]; let hasMore: Bool }

enum ChatStreamEvent: Sendable {
    case started(String), retrieval(Int), delta(String), citation(page: Int?), completed, failed(String)
}

import Foundation

struct SearchPassage: Decodable, Sendable, Identifiable {
    let chunkId: String
    let content: String
    let pageStart: Int?
    let pageEnd: Int?
    let score: Double
    var id: String { chunkId }
}

struct SearchResult: Decodable, Sendable, Identifiable {
    let documentId: String
    let title: String
    let score: Double
    let passages: [SearchPassage]
    var id: String { documentId }
}

struct SearchResponse: Decodable, Sendable { let results: [SearchResult] }

struct NotificationItem: Decodable, Sendable, Identifiable {
    let id: String
    let type: String
    let title: String
    let body: String
    let resourceType: String
    let resourceId: String
    let read: Bool
    let createdAt: Date
}

struct NotificationsResponse: Decodable, Sendable { let notifications: [NotificationItem] }
struct UnreadCountResponse: Decodable, Sendable { let count: Int }
struct UpdatedCountResponse: Decodable, Sendable { let updated: Int }
struct NotificationSnapshot: Decodable, Sendable { let unreadCount: Int }

struct MeResponse: Decodable, Sendable {
    struct User: Decodable, Sendable { let id: String; let name: String; let email: String }
    struct Workspace: Decodable, Sendable { let id: String; let name: String; let role: String }
    let user: User
    let workspaces: [Workspace]
}

struct UsageResponse: Decodable, Sendable {
    struct Amount: Decodable, Sendable { let used: Int; let limit: Int }
    struct Usage: Decodable, Sendable {
        let storageBytes: Amount
        let documentCount: Amount
        let monthlyAiTokens: Amount
        let monthlyQuestions: Amount
    }
    let usage: Usage
}

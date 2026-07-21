import Foundation

enum DocumentStatus: String, Codable, Sendable, CaseIterable {
    case pendingUpload = "pending_upload"
    case uploaded, queued, processing, ready
    case partiallyReady = "partially_ready"
    case failed, deleting, deleted

    var isInFlight: Bool { self == .queued || self == .processing || self == .deleting }
}

struct DocumentItem: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let status: DocumentStatus
    let currentStage: String?
    let progress: Int
    let sizeBytes: Int
    let pageCount: Int?
    let errorCode: String?
    let createdAt: Date
}

struct DocumentsResponse: Decodable, Sendable { let documents: [DocumentItem] }

struct CreateUploadBody: Encodable, Sendable {
    let filename: String
    let contentType: String
    let sizeBytes: Int
    let checksumSha256: String
}

struct CreateUploadResult: Decodable, Sendable {
    struct Document: Decodable, Sendable { let id: String; let status: DocumentStatus }
    struct Upload: Decodable, Sendable {
        let method: String
        let url: URL
        let headers: [String: String]
        let expiresAt: Date
    }
    let document: Document
    let upload: Upload?
    let duplicate: Bool?
}

struct CompleteUploadResult: Decodable, Sendable {
    let document: CreateUploadResult.Document
    let alreadyQueued: Bool
}

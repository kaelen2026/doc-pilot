import Foundation

struct DocumentsClient: Sendable {
    let api: APIClient

    func list() async throws -> [DocumentItem] {
        let response: DocumentsResponse = try await api.send("/documents")
        return response.documents
    }
}

import Foundation
import Observation

private struct FileURLResponse: Decodable, Sendable { let url: URL; let expiresAt: Date }

@MainActor @Observable
final class ReaderModel {
    enum State { case idle, loading, loaded(URL), failed }
    private(set) var state = State.idle
    var pageIndex = 0
    private let documentID: String
    private let userID: String
    private let api: APIClient
    private let cache: DocumentCache

    init(documentID: String, userID: String, api: APIClient, cache: DocumentCache = DocumentCache()) {
        self.documentID = documentID; self.userID = userID; self.api = api; self.cache = cache
    }

    func load() async {
        state = .loading
        let key = DocumentCacheKey(userID: userID, documentID: documentID, version: 1)
        if let cached = await cache.cachedURL(for: key) { state = .loaded(cached); return }
        do {
            let target: FileURLResponse = try await api.send("/documents/\(documentID)/file-url")
            let response = try await api.transport.send(URLRequest(url: target.url))
            guard 200..<300 ~= response.response.statusCode,
                  response.data.starts(with: Data("%PDF-".utf8)) else { throw APIError.invalidResponse }
            state = .loaded(try await cache.store(response.data, for: key))
        } catch { state = .failed }
    }
}

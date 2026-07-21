import Foundation
import Observation

@MainActor @Observable
final class SearchModel {
    var query = ""
    private(set) var results: [SearchResult] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func search() async {
        let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count >= 2 else { results = []; return }
        do {
            try await Task.sleep(for: .milliseconds(250))
            try Task.checkCancellation()
            isLoading = true
            defer { isLoading = false }
            var components = URLComponents()
            components.path = "/api/v1/search"
            components.queryItems = [URLQueryItem(name: "q", value: value)]
            guard let path = components.string else { throw APIError.invalidResponse }
            let response: SearchResponse = try await api.send(path)
            results = response.results
            errorMessage = nil
        } catch is CancellationError {
        } catch {
            errorMessage = "搜索失败，请稍后重试。"
        }
    }
}

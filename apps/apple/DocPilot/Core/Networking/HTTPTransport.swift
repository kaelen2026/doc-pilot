import Foundation

struct HTTPResponse: Sendable {
    let data: Data
    let response: HTTPURLResponse
}

protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> HTTPResponse
}

struct URLSessionTransport: HTTPTransport {
    func send(_ request: URLRequest) async throws -> HTTPResponse {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        return HTTPResponse(data: data, response: response)
    }
}

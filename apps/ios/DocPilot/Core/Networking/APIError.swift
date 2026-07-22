import Foundation

enum APIError: Error, Equatable {
    case invalidResponse
    case unauthorized
    case server(statusCode: Int, code: String?)
    case decoding
    case transport
}

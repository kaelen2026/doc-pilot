import Foundation

struct EmptyResponse: Decodable, Sendable {}

struct APIClient: Sendable {
    let baseURL: URL
    let transport: any HTTPTransport
    var token: (@Sendable () async -> String?)?

    func send<Response: Decodable & Sendable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable & Sendable)? = nil,
        headers: [String: String] = [:],
        responseType: Response.Type = Response.self
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        if let bearer = await token?(), !bearer.isEmpty {
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let result: HTTPResponse
        do {
            result = try await transport.send(request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport
        }

        if result.response.statusCode == 401 { throw APIError.unauthorized }
        guard 200..<300 ~= result.response.statusCode else {
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: result.data)
            throw APIError.server(statusCode: result.response.statusCode, code: envelope?.code)
        }
        if Response.self == EmptyResponse.self, result.data.isEmpty {
            return EmptyResponse() as! Response
        }
        do {
            return try JSONDecoder.docPilot.decode(Response.self, from: result.data)
        } catch {
            throw APIError.decoding
        }
    }
}

private struct ErrorEnvelope: Decodable { let code: String? }

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}

extension JSONDecoder {
    static var docPilot: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

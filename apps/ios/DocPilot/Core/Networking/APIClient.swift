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
        request.setValue("docpilot://", forHTTPHeaderField: "Origin")
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
        // better-auth 的时间戳来自 JS `toISOString()`,恒带毫秒(如 `2026-07-30T10:06:29.476Z`);
        // 而 `.iso8601` 默认不解析小数秒,会让 get-session 的 expiresAt 解码失败、整条登录收尾崩。
        // 故自定义:先试带小数秒,再退回不带,两种 ISO8601 都能解。
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            // ISO8601DateFormatter 非 Sendable,不能作全局常量(Swift 6 严格并发),就地构造。
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: raw) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "无法解析 ISO8601 日期：\(raw)"
            )
        }
        return decoder
    }
}

import Foundation
import Testing
@testable import DocPilot

struct APIClientTests {
    @Test func 注入Bearer并解码响应() async throws {
        let transport = RecordingTransport(
            data: Data("{\"value\":\"ok\"}".utf8), statusCode: 200
        )
        let client = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { "fixture-token" }
        )

        let response: ValueResponse = try await client.send("/v1/example")

        #expect(response.value == "ok")
        #expect(await transport.authorization == "Bearer fixture-token")
        #expect(await transport.url?.absoluteString == "https://api.example.invalid/v1/example")
    }

    @Test func 将401映射为未授权() async throws {
        let transport = RecordingTransport(data: Data(), statusCode: 401)
        let client = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport
        )

        await #expect(throws: APIError.unauthorized) {
            let _: ValueResponse = try await client.send("/private")
        }
    }
}

private struct ValueResponse: Decodable, Sendable { let value: String }

private actor RecordingTransport: HTTPTransport {
    private let data: Data
    private let statusCode: Int
    private(set) var authorization: String?
    private(set) var url: URL?

    init(data: Data, statusCode: Int) { self.data = data; self.statusCode = statusCode }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        authorization = request.value(forHTTPHeaderField: "Authorization")
        url = request.url
        let response = HTTPURLResponse(
            url: request.url!, statusCode: statusCode, httpVersion: nil, headerFields: nil
        )!
        return HTTPResponse(data: data, response: response)
    }
}

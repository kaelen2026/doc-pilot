import Foundation
import Testing
@testable import DocPilot

struct AuthClientGoogleTests {
    @Test func Google登录从响应头取token并返回session() async throws {
        let store = InMemoryGoogleTokenStore()
        let transport = GoogleStubTransport()
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        let session = try await client.signInWithGoogle(idToken: "google-id-token")

        // token 从 set-auth-token 头落 Keychain。
        #expect(try store.loadToken() == "google-session-token")
        // 会话由随后的 get-session 拉回。
        #expect(session.user.email == "google@example.com")
        #expect(session.user.id == "u3")

        // 请求打到 better-auth 的 sign-in/social,请求体形状:{ provider: "google", idToken: { token } }。
        #expect(await transport.socialPath == "/api/auth/sign-in/social")
        let body = try #require(await transport.socialRequestBody)
        let decoded = try JSONDecoder().decode(SentGoogleBody.self, from: body)
        #expect(decoded.provider == "google")
        #expect(decoded.idToken.token == "google-id-token")
        // Google 无需 nonce:该键在请求体中应被省略。
        #expect(decoded.idToken.nonce == nil)
        let rawKeys = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        let idTokenObject = try #require(rawKeys?["idToken"] as? [String: Any])
        #expect(idTokenObject["nonce"] == nil)

        // get-session 请求带上了刚存的 bearer。
        #expect(await transport.sessionAuthorization == "Bearer google-session-token")
    }

    @Test func 缺少set_auth_token头视为无效响应() async throws {
        let store = InMemoryGoogleTokenStore()
        let transport = GoogleStubTransport(includeAuthTokenHeader: false)
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        await #expect(throws: APIError.invalidResponse) {
            _ = try await client.signInWithGoogle(idToken: "google-id-token")
        }
        #expect(try store.loadToken() == nil)
    }
}

private struct SentGoogleBody: Decodable {
    struct IDToken: Decodable { let token: String; let nonce: String? }
    let provider: String
    let idToken: IDToken
}

private final class InMemoryGoogleTokenStore: SecureTokenStore, @unchecked Sendable {
    private var token: String?
    func loadToken() throws -> String? { token }
    func saveToken(_ token: String) throws { self.token = token }
    func deleteToken() throws { token = nil }
}

/// 按路径路由的桩:sign-in/social 回带 set-auth-token 头,get-session 回一个会话。
private actor GoogleStubTransport: HTTPTransport {
    private let includeAuthTokenHeader: Bool
    private(set) var socialRequestBody: Data?
    private(set) var socialPath: String?
    private(set) var sessionAuthorization: String?

    init(includeAuthTokenHeader: Bool = true) {
        self.includeAuthTokenHeader = includeAuthTokenHeader
    }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/auth/sign-in/social":
            socialPath = path
            socialRequestBody = request.httpBody
            let headers = includeAuthTokenHeader ? ["set-auth-token": "google-session-token"] : [:]
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers
            )!
            return HTTPResponse(data: Data("{}".utf8), response: response)
        case "/api/auth/get-session":
            sessionAuthorization = request.value(forHTTPHeaderField: "Authorization")
            let json = """
            {"user":{"id":"u3","name":"Google User","email":"google@example.com"},\
            "session":{"id":"s3","expiresAt":"2030-01-01T00:00:00Z"}}
            """
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return HTTPResponse(data: Data(json.utf8), response: response)
        default:
            throw APIError.invalidResponse
        }
    }
}

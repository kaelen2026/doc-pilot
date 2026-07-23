import Foundation
import Testing
@testable import DocPilot

struct AuthClientPasswordTests {
    @Test func 密码登录从响应头取token并返回session() async throws {
        let store = InMemoryPasswordTokenStore()
        let transport = PasswordStubTransport()
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        let session = try await client.signInWithPassword(
            email: "review@docpilot.app", password: "DocPilot-Review-2026"
        )

        // token 从 set-auth-token 头落 Keychain。
        #expect(try store.loadToken() == "password-session-token")
        // 会话由随后的 get-session 拉回。
        #expect(session.user.email == "review@docpilot.app")
        #expect(session.user.id == "u2")

        // 请求打到 better-auth 的 sign-in/email,请求体形状:{ email, password }。
        #expect(await transport.signInPath == "/api/auth/sign-in/email")
        let body = try #require(await transport.signInRequestBody)
        let decoded = try JSONDecoder().decode(SentEmailBody.self, from: body)
        #expect(decoded.email == "review@docpilot.app")
        #expect(decoded.password == "DocPilot-Review-2026")

        // get-session 请求带上了刚存的 bearer。
        #expect(await transport.sessionAuthorization == "Bearer password-session-token")
    }

    @Test func 缺少set_auth_token头视为无效响应() async throws {
        let store = InMemoryPasswordTokenStore()
        let transport = PasswordStubTransport(includeAuthTokenHeader: false)
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        await #expect(throws: APIError.invalidResponse) {
            _ = try await client.signInWithPassword(email: "a@b.com", password: "x")
        }
        #expect(try store.loadToken() == nil)
    }
}

private struct SentEmailBody: Decodable { let email: String; let password: String }

private final class InMemoryPasswordTokenStore: SecureTokenStore, @unchecked Sendable {
    private var token: String?
    func loadToken() throws -> String? { token }
    func saveToken(_ token: String) throws { self.token = token }
    func deleteToken() throws { token = nil }
}

/// 按路径路由的桩:sign-in/email 回带 set-auth-token 头,get-session 回一个会话。
private actor PasswordStubTransport: HTTPTransport {
    private let includeAuthTokenHeader: Bool
    private(set) var signInRequestBody: Data?
    private(set) var signInPath: String?
    private(set) var sessionAuthorization: String?

    init(includeAuthTokenHeader: Bool = true) {
        self.includeAuthTokenHeader = includeAuthTokenHeader
    }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/auth/sign-in/email":
            signInPath = path
            signInRequestBody = request.httpBody
            let headers = includeAuthTokenHeader ? ["set-auth-token": "password-session-token"] : [:]
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers
            )!
            return HTTPResponse(data: Data("{}".utf8), response: response)
        case "/api/auth/get-session":
            sessionAuthorization = request.value(forHTTPHeaderField: "Authorization")
            let json = """
            {"user":{"id":"u2","name":"Review","email":"review@docpilot.app"},\
            "session":{"id":"s2","expiresAt":"2030-01-01T00:00:00Z"}}
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

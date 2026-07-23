import Foundation
import Testing
@testable import DocPilot

struct AppleSignInTests {
    @Test func sha256Hex匹配已知向量() {
        // sha256("abc") 的标准结果,逐字节小写十六进制。
        #expect(
            AppleSignIn.sha256Hex("abc")
                == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
    }

    @Test func randomNonce每次不同且非空() {
        let a = AppleSignIn.randomNonce()
        let b = AppleSignIn.randomNonce()
        #expect(!a.isEmpty)
        #expect(a != b)
    }
}

struct AuthClientAppleTests {
    @Test func Apple登录从响应头取token并返回session() async throws {
        let store = InMemoryTokenStore()
        let transport = AppleStubTransport()
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        let session = try await client.signInWithApple(identityToken: "apple-id-token", nonce: "raw-nonce")

        // token 从 set-auth-token 头落 Keychain。
        #expect(try store.loadToken() == "apple-session-token")
        // 会话由随后的 get-session 拉回。
        #expect(session.user.email == "apple@example.com")
        #expect(session.user.id == "u1")

        // 请求体形状:{ provider: "apple", idToken: { token, nonce } }。
        let body = try #require(await transport.socialRequestBody)
        let decoded = try JSONDecoder().decode(SentSocialBody.self, from: body)
        #expect(decoded.provider == "apple")
        #expect(decoded.idToken.token == "apple-id-token")
        #expect(decoded.idToken.nonce == "raw-nonce")

        // get-session 请求带上了刚存的 bearer。
        #expect(await transport.sessionAuthorization == "Bearer apple-session-token")
    }

    @Test func 缺少set_auth_token头视为无效响应() async throws {
        let store = InMemoryTokenStore()
        let transport = AppleStubTransport(includeAuthTokenHeader: false)
        let api = APIClient(
            baseURL: try #require(URL(string: "https://api.example.invalid")),
            transport: transport,
            token: { try? store.loadToken() }
        )
        let client = AuthClient(api: api, tokenStore: store)

        await #expect(throws: APIError.invalidResponse) {
            _ = try await client.signInWithApple(identityToken: "apple-id-token", nonce: nil)
        }
        #expect(try store.loadToken() == nil)
    }
}

private struct SentSocialBody: Decodable {
    struct IDToken: Decodable { let token: String; let nonce: String? }
    let provider: String
    let idToken: IDToken
}

private final class InMemoryTokenStore: SecureTokenStore, @unchecked Sendable {
    private var token: String?
    func loadToken() throws -> String? { token }
    func saveToken(_ token: String) throws { self.token = token }
    func deleteToken() throws { token = nil }
}

/// 按路径路由的桩:sign-in/social 回带 set-auth-token 头,get-session 回一个会话。
private actor AppleStubTransport: HTTPTransport {
    private let includeAuthTokenHeader: Bool
    private(set) var socialRequestBody: Data?
    private(set) var sessionAuthorization: String?

    init(includeAuthTokenHeader: Bool = true) {
        self.includeAuthTokenHeader = includeAuthTokenHeader
    }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/auth/sign-in/social":
            socialRequestBody = request.httpBody
            let headers = includeAuthTokenHeader ? ["set-auth-token": "apple-session-token"] : [:]
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers
            )!
            return HTTPResponse(data: Data("{}".utf8), response: response)
        case "/api/auth/get-session":
            sessionAuthorization = request.value(forHTTPHeaderField: "Authorization")
            let json = """
            {"user":{"id":"u1","name":"Apple User","email":"apple@example.com"},\
            "session":{"id":"s1","expiresAt":"2030-01-01T00:00:00Z"}}
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

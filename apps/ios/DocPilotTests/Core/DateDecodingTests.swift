import Foundation
import Testing
@testable import DocPilot

/// 钉住 better-auth 时间戳的解码:JS `toISOString()` 恒带毫秒(如 `...:29.476Z`),
/// 而 `.iso8601` 默认不吃小数秒。`get-session` 的 `expiresAt` 走这条,一旦解不动
/// 登录收尾(bearerSignIn → restoreSession)就整条失败。三条登录路径共用,故这里钉死。
struct DateDecodingTests {
    private struct Wrapper: Decodable, Equatable { let expiresAt: Date }

    @Test func 带毫秒的ISO8601可解码() throws {
        let json = Data(#"{"expiresAt":"2026-07-30T10:06:29.476Z"}"#.utf8)
        let decoded = try JSONDecoder.docPilot.decode(Wrapper.self, from: json)
        // 2026-07-30T10:06:29.476Z 的 Unix 秒(含 .476 小数)。
        #expect(abs(decoded.expiresAt.timeIntervalSince1970 - 1_785_405_989.476) < 0.001)
    }

    @Test func 不带毫秒的ISO8601仍可解码() throws {
        let json = Data(#"{"expiresAt":"2030-01-01T00:00:00Z"}"#.utf8)
        let decoded = try JSONDecoder.docPilot.decode(Wrapper.self, from: json)
        #expect(abs(decoded.expiresAt.timeIntervalSince1970 - 1_893_456_000) < 0.001)
    }

    @Test func 完整会话响应带毫秒可解码() throws {
        // 真实 better-auth get-session 形状:session.expiresAt 带毫秒。
        let json = Data(#"""
        {"session":{"id":"s1","expiresAt":"2026-07-30T10:06:29.476Z"},
         "user":{"id":"u1","name":"App Review","email":"review@docpilot.app"}}
        """#.utf8)
        let session = try JSONDecoder.docPilot.decode(AuthSession.self, from: json)
        #expect(session.user.email == "review@docpilot.app")
    }
}

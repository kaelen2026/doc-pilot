import CryptoKit
import Foundation

/// Sign in with Apple 的 nonce 工具(纯函数,可单测)。
///
/// 防重放约定(与后端 better-auth apple provider 的 `verifyIdToken` 对齐):
/// - iOS 生成密码学随机 `rawNonce`;
/// - 下发给 Apple 的 `ASAuthorizationAppleIDRequest.nonce` 用 `sha256Hex(rawNonce)`,
///   Apple 会把它原样写进 idToken 的 `nonce` claim;
/// - 登录请求 body 里回传 `rawNonce`,后端 `nonceMatches` 判定
///   `jwtNonce === sha256Hex(rawNonce)` 成立(见 @better-auth/core apple.ts)。
enum AppleSignIn {
    /// 生成密码学随机 raw nonce(默认 32 字节 → base64url 无填充)。
    static func randomNonce(byteCount: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        // SecRandom 极少失败;失败时回退到 UUID 拼接,保证仍有足够熵而不崩溃。
        guard status == errSecSuccess else {
            return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
        }
        return Data(bytes).base64URLEncodedString()
    }

    /// 对字符串取 SHA-256 并输出小写十六进制(与后端 `sha256Hex` 逐字节对齐)。
    static func sha256Hex(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

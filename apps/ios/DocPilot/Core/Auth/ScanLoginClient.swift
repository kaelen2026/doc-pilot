import Foundation

/// 扫码登录(iOS 扫码授权 web 端登录)常量与解析。
/// 与 web 的 `packages/contracts/src/scan-login.ts` 对齐,底层是 Better Auth
/// device-authorization 流程(RFC 8628,见 ADR-011)。改动先动 contracts 再回搬。
enum ScanLogin {
    /// 二维码承载的深链 scheme(= 插件 verificationUri)。
    static let scheme = "docpilot://device-login"
    /// verification_uri_complete 里承载用户码的 query 参数名(Better Auth 固定)。
    static let userCodeParam = "user_code"

    /// 从扫到的字符串解析出 user_code。接受完整深链,也兼容裸用户码;无法识别时返回 nil。
    static func parseUserCode(from scanned: String) -> String? {
        let raw = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        if let components = URLComponents(string: raw),
           let value = components.queryItems?.first(where: { $0.name == userCodeParam })?.value {
            let code = value.trimmingCharacters(in: .whitespaces)
            return code.isEmpty ? nil : code
        }
        // 非 URL / 无 query:视为裸用户码,仅接受设备流字符集,避免把任意文本误当作码。
        return raw.range(of: "^[A-Za-z0-9-]{4,}$", options: .regularExpression) != nil ? raw : nil
    }
}

/// 设备授权的认领/批准/拒绝(已登录 iOS 端调用,带 bearer)。
/// 端点经 Better Auth 挂在 /api/auth/device/*(RFC 8628)。
struct ScanLoginClient: Sendable {
    let api: APIClient

    /// 认领设备码:GET /device?user_code= 会把 userId 绑到该设备码。
    /// **必须在 approve/deny 之前调用**——否则后端以 DEVICE_CODE_NOT_CLAIMED 拒绝(见 ADR-011)。
    /// 返回设备码当前状态(pending 表示可继续确认)。
    @discardableResult
    func claim(userCode: String) async throws -> String {
        let encoded =
            userCode.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) ?? userCode
        let res: DeviceVerifyResponse = try await api.send("/api/auth/device?user_code=\(encoded)")
        return res.status
    }

    func approve(userCode: String) async throws {
        try await post("/api/auth/device/approve", userCode: userCode)
    }

    func deny(userCode: String) async throws {
        try await post("/api/auth/device/deny", userCode: userCode)
    }

    private func post(_ path: String, userCode: String) async throws {
        let _: DeviceActionResponse = try await api.send(
            path, method: "POST", body: DeviceActionBody(userCode: userCode)
        )
    }
}

private struct DeviceVerifyResponse: Decodable, Sendable { let status: String }
private struct DeviceActionBody: Encodable, Sendable { let userCode: String }
private struct DeviceActionResponse: Decodable, Sendable { let success: Bool }

private extension CharacterSet {
    /// query 值允许的字符(排除 & = ? # + 等分隔符),用于安全拼接 user_code。
    static let urlQueryValueAllowed: CharacterSet = {
        var set = CharacterSet.urlQueryAllowed
        set.remove(charactersIn: "&=?#+")
        return set
    }()
}

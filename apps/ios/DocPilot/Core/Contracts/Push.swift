import Foundation

/// APNS 环境:Debug 走 sandbox(APNS 沙盒),Release/TestFlight/App Store 走 production。
/// 必须与 `aps-environment` entitlement 的取值一致(Debug=development→sandbox,Release=production)。
enum PushEnvironment: String, Sendable {
    case sandbox
    case production

    /// 由构建配置推断:`#if DEBUG` → sandbox,否则 production。
    static var current: PushEnvironment {
        #if DEBUG
        return .sandbox
        #else
        return .production
        #endif
    }
}

/// `POST /push/devices` 请求体:上报本机 APNS device token。
/// token 为小写十六进制、无空格/方括号;platform 恒为 "ios"。
struct RegisterDeviceRequest: Encodable, Sendable {
    let token: String
    let platform: String
    let environment: String
}

/// `POST /push/devices` / `DELETE /push/devices/{token}` 的响应:`{ "ok": true }`。
struct PushDeviceResponse: Decodable, Sendable {
    let ok: Bool
}

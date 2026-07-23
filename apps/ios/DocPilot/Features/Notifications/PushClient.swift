import Foundation

/// 推送设备注册的网络层:复用带 Bearer 的 `APIClient` 打 `/push/devices`。
/// 注册是幂等的(后端 upsert),每次启动/登录重复调用是预期行为。
struct PushClient: Sendable {
    let api: APIClient

    /// 注册/刷新本机 APNS token。
    func register(token: String, environment: PushEnvironment) async throws {
        let body = RegisterDeviceRequest(
            token: token, platform: "ios", environment: environment.rawValue
        )
        let _: PushDeviceResponse = try await api.send(
            "/push/devices", method: "POST", body: body
        )
    }

    /// 注销本机 token(best-effort,如退出登录时)。
    func unregister(token: String) async throws {
        let _: PushDeviceResponse = try await api.send(
            "/push/devices/\(token)", method: "DELETE"
        )
    }
}

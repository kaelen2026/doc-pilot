import Foundation
import Observation

/// 扫码登录授权流程状态机(iOS 端为已登录设备,批准 web 端的登录请求)。
@MainActor @Observable
final class ScanLoginModel {
    enum Phase: Equatable {
        case scanning
        case confirming(userCode: String)
        case working
        case approved
        case denied
        case failed
    }

    private(set) var phase: Phase = .scanning
    private let client: ScanLoginClient

    init(client: ScanLoginClient) { self.client = client }

    /// 相机识别到内容时调用。仅在扫描态处理并解析出用户码后进入确认(一次性 guard,
    /// 避免连续识别流反复触发,见 iOS26 SwiftUI 坑)。无法识别的载荷忽略,继续扫描。
    func handleScan(_ payload: String) {
        guard phase == .scanning, let userCode = ScanLogin.parseUserCode(from: payload) else { return }
        phase = .confirming(userCode: userCode)
    }

    /// 用户在手机上确认批准 → web 端下一次轮询即拿到会话。
    func approve() async {
        guard case let .confirming(userCode) = phase else { return }
        phase = .working
        do {
            try await client.approve(userCode: userCode)
            phase = .approved
        } catch {
            phase = .failed
        }
    }

    /// 用户在手机上取消 → 主动 deny,让 web 端即时收到 access_denied(而非空等超时)。
    func cancel() async {
        guard case let .confirming(userCode) = phase else { return }
        phase = .working
        try? await client.deny(userCode: userCode)
        phase = .denied
    }

    /// 失败/拒绝后重新扫码。
    func rescan() { phase = .scanning }
}

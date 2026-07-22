import AudioToolbox
import Foundation
import Observation
import UIKit

/// 扫码登录授权流程状态机(iOS 端为已登录设备,批准 web 端的登录请求)。
@MainActor @Observable
final class ScanLoginModel {
    enum Phase: Equatable {
        case scanning
        case working
        case confirming(userCode: String)
        case approved
        case denied
        case failed
    }

    private(set) var phase: Phase = .scanning
    private let client: ScanLoginClient

    init(client: ScanLoginClient) { self.client = client }

    /// 相机识别到内容时调用。仅在扫描态处理并解析出用户码后提交(一次性 guard:
    /// 提交即转 .working,连续识别流的后续回调被挡住,见 iOS26 SwiftUI 坑)。无法识别的载荷忽略。
    func handleScan(_ payload: String) {
        guard phase == .scanning, let userCode = ScanLogin.parseUserCode(from: payload) else { return }
        Task { await submit(userCode) }
    }

    /// 手动输入配对码提交(扫不动时的兜底)。解析后走与扫码一致的认领流程。
    func submitManual(_ raw: String) {
        guard phase == .scanning, let userCode = ScanLogin.parseUserCode(from: raw) else { return }
        Task { await submit(userCode) }
    }

    /// 认领设备码(GET /device 绑定 userId),成功后给出声音+震动反馈并进入确认。
    /// 认领是 approve/deny 的前置(否则后端 DEVICE_CODE_NOT_CLAIMED)。
    private func submit(_ userCode: String) async {
        guard phase == .scanning else { return }
        phase = .working
        do {
            try await client.claim(userCode: userCode)
            playSuccessFeedback()
            phase = .confirming(userCode: userCode)
        } catch {
            phase = .failed
        }
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

    /// 扫到有效码的反馈:系统提示音 + 成功触感震动。
    private func playSuccessFeedback() {
        AudioServicesPlaySystemSound(1057)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}

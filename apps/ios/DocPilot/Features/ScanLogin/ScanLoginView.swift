import SwiftUI
import VisionKit

/// 扫码登录网页版:小取景框扫 QR(带扫描动画)或手动输入配对码 → 确认 → 批准/取消。
/// 以 sheet 从账户页拉起。
struct ScanLoginView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: ScanLoginModel
    @State private var manualCode = ""

    init(client: ScanLoginClient) {
        _model = State(initialValue: ScanLoginModel(client: client))
    }

    private var cameraReady: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DesignTokens.spacingLg) {
                    Text("用已登录的 DocPilot 扫描网页上的二维码,确认后即可在电脑登录。")
                        .font(.subheadline)
                        .foregroundStyle(DesignTokens.inkSoft)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    body(for: model.phase)
                }
                .padding(DesignTokens.spacing)
            }
            .background(DesignTokens.paper)
            .navigationTitle("扫码登录网页版")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("关闭") { dismiss() }.tint(DesignTokens.seal)
                }
            }
        }
    }

    // 守卫式早返回的 SwiftUI 版:每个 phase 一段,平铺(见 frontend.md 状态渲染)。
    @ViewBuilder private func body(for phase: ScanLoginModel.Phase) -> some View {
        switch phase {
        case .scanning:
            if cameraReady {
                ScannerViewfinder(onScan: model.handleScan)
            } else {
                cameraUnavailableNote
            }
            manualEntry
        case .working:
            statusCard(icon: nil, title: "校验中…", detail: nil, action: nil)
        case .confirming:
            confirmCard
        case .approved:
            statusCard(icon: "checkmark.seal.fill", title: "网页版已登录",
                       detail: "回到电脑即可继续使用。", action: ("完成", { dismiss() }))
        case .denied:
            statusCard(icon: "xmark.circle", title: "已取消登录", detail: nil,
                       action: ("重新扫码", resetToScan))
        case .failed:
            statusCard(icon: "exclamationmark.triangle", title: "配对失败",
                       detail: "配对码无效或已过期,请在网页刷新二维码后重试。",
                       action: ("重新扫码", resetToScan))
        }
    }

    private func resetToScan() {
        manualCode = ""
        model.rescan()
    }

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingSm) {
            Text("扫不动?手动输入配对码")
                .font(.caption.weight(.medium))
                .foregroundStyle(DesignTokens.inkFaint)
            HStack(spacing: 10) {
                TextField("如 JRSD2623", text: $manualCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.body.monospaced())
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(
                        DesignTokens.paperRaised,
                        in: RoundedRectangle(cornerRadius: DesignTokens.radiusMd, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.radiusMd, style: .continuous)
                            .stroke(DesignTokens.hairline, lineWidth: 1)
                    )
                Button("提交") { model.submitManual(manualCode) }
                    .buttonStyle(.glass).tint(DesignTokens.seal)
                    .disabled(manualCode.trimmingCharacters(in: .whitespaces).count < 4)
            }
        }
    }

    private var cameraUnavailableNote: some View {
        VStack(spacing: DesignTokens.spacingSm) {
            Image(systemName: "camera.metering.unknown")
                .font(.largeTitle).foregroundStyle(DesignTokens.inkFaint)
            Text("此设备不支持相机扫码,请手动输入配对码。")
                .font(.subheadline).foregroundStyle(DesignTokens.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DesignTokens.spacingLg)
    }

    private var confirmCard: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacing) {
            cardText(title: "在网页版登录 DocPilot?", detail: "确认是你本人正在电脑上登录。")
            HStack(spacing: 12) {
                Button("取消") { Task { await model.cancel() } }
                    .buttonStyle(.bordered).frame(maxWidth: .infinity)
                Button("批准登录") { Task { await model.approve() } }
                    .buttonStyle(.glass).tint(DesignTokens.seal).frame(maxWidth: .infinity)
            }
        }
        .padding(DesignTokens.spacing)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }

    private func statusCard(
        icon: String?, title: String, detail: String?, action: (label: String, run: () -> Void)?
    ) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacing) {
            HStack(spacing: 10) {
                if let icon {
                    Image(systemName: icon).font(.title2).foregroundStyle(DesignTokens.seal)
                } else {
                    ProgressView().tint(DesignTokens.seal)
                }
                cardText(title: title, detail: detail)
            }
            if let action {
                Button(action.label, action: action.run)
                    .buttonStyle(.glass).tint(DesignTokens.seal).frame(maxWidth: .infinity)
            }
        }
        .padding(DesignTokens.spacing)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }

    private func cardText(title: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline).foregroundStyle(DesignTokens.ink)
            if let detail {
                Text(detail).font(.subheadline).foregroundStyle(DesignTokens.inkSoft)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 小取景框 + 扫描线动画。仅在扫描态出现;移出即销毁,相机随之停。
private struct ScannerViewfinder: View {
    let onScan: @MainActor (String) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweepDown = false

    private let side: CGFloat = 240

    var body: some View {
        ZStack {
            CodeScannerView(isScanning: true, onScan: onScan)
            RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
                .strokeBorder(.white.opacity(0.7), lineWidth: 2)
            if !reduceMotion {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.clear, DesignTokens.seal, .clear],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .frame(height: 2)
                    .offset(y: sweepDown ? side / 2 - 14 : -(side / 2 - 14))
                    .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: sweepDown)
            }
        }
        .frame(width: side, height: side)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous))
        .frame(maxWidth: .infinity)
        .onAppear { sweepDown = true }
    }
}

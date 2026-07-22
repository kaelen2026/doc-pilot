import SwiftUI
import VisionKit

/// 扫码登录网页版:相机取景扫 QR → 底部卡片确认 → 批准/取消。以 sheet 从账户页拉起。
struct ScanLoginView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: ScanLoginModel

    init(client: ScanLoginClient) {
        _model = State(initialValue: ScanLoginModel(client: client))
    }

    private var cameraReady: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("扫码登录网页版")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("关闭") { dismiss() }.tint(DesignTokens.seal)
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        if cameraReady {
            ZStack {
                CodeScannerView(isScanning: model.phase == .scanning, onScan: model.handleScan)
                    .ignoresSafeArea()
                overlay
            }
        } else {
            VStack(spacing: DesignTokens.spacing) {
                Image(systemName: "camera.metering.unknown")
                    .font(.largeTitle).foregroundStyle(DesignTokens.inkFaint)
                Text("此设备不支持相机扫码。")
                    .font(.body).foregroundStyle(DesignTokens.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DesignTokens.paper)
        }
    }

    // 相机之上按状态叠加提示 / 确认卡片 / 结果卡片。
    @ViewBuilder private var overlay: some View {
        switch model.phase {
        case .scanning:
            Text("将网页上的二维码放入取景框")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.black.opacity(0.55), in: Capsule())
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 40)
        case .confirming:
            bottomCard {
                cardText(title: "在网页版登录 DocPilot?", detail: "确认是你本人正在电脑上登录。")
                HStack(spacing: 12) {
                    Button("取消") { Task { await model.cancel() } }
                        .buttonStyle(.bordered).frame(maxWidth: .infinity)
                    Button("批准登录") { Task { await model.approve() } }
                        .buttonStyle(.glass).tint(DesignTokens.seal).frame(maxWidth: .infinity)
                }
            }
        case .working:
            ProgressView().controlSize(.large).tint(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.black.opacity(0.4))
        case .approved:
            resultCard(icon: "checkmark.seal.fill", title: "网页版已登录",
                       detail: "回到电脑即可继续使用。",
                       action: ("完成", { dismiss() }))
        case .denied:
            resultCard(icon: "xmark.circle", title: "已取消登录", detail: nil,
                       action: ("重新扫码", { model.rescan() }))
        case .failed:
            resultCard(icon: "exclamationmark.triangle", title: "操作失败", detail: "请重试。",
                       action: ("重新扫码", { model.rescan() }))
        }
    }

    private func resultCard(
        icon: String, title: String, detail: String?, action: (label: String, run: () -> Void)
    ) -> some View {
        bottomCard {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.title2).foregroundStyle(DesignTokens.seal)
                cardText(title: title, detail: detail)
            }
            Button(action.label, action: action.run)
                .buttonStyle(.glass).tint(DesignTokens.seal).frame(maxWidth: .infinity)
        }
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

    private func bottomCard(@ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacing) {
            content()
        }
        .padding(DesignTokens.spacing)
        .frame(maxWidth: .infinity)
        .cardSurface()
        .padding(DesignTokens.spacing)
        .frame(maxHeight: .infinity, alignment: .bottom)
    }
}

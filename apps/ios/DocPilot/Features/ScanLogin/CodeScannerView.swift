import SwiftUI
import VisionKit

/// 把 VisionKit 的 DataScannerViewController 包成 SwiftUI 视图,只识别 QR 码。
/// 调用方负责判断 `DataScannerViewController.isSupported/isAvailable`(模拟器无相机)。
struct CodeScannerView: UIViewControllerRepresentable {
    /// 是否处于扫描态:非扫描态(确认/结果)时停止取景。
    let isScanning: Bool
    let onScan: @MainActor (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if isScanning, !scanner.isScanning {
            try? scanner.startScanning()
        } else if !isScanning, scanner.isScanning {
            scanner.stopScanning()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onScan: @MainActor (String) -> Void
        init(onScan: @escaping @MainActor (String) -> Void) { self.onScan = onScan }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            // VisionKit 在主线程回调;取第一个 QR 载荷交给 model。
            for item in addedItems {
                if case let .barcode(barcode) = item, let payload = barcode.payloadStringValue {
                    MainActor.assumeIsolated { onScan(payload) }
                    return
                }
            }
        }
    }
}

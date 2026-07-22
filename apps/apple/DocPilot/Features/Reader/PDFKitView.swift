import PDFKit
import SwiftUI

struct PDFKitView: UIViewRepresentable {
    let url: URL
    @Binding var pageIndex: Int
    let highlights: [Highlight]
    let onSelection: (Int, CGRect, String) -> Void

    func makeUIView(context: Context) -> PDFView { configuredView(context: context) }
    func updateUIView(_ view: PDFView, context: Context) { context.coordinator.update(view, pageIndex: pageIndex, highlights: highlights) }
    func makeCoordinator() -> Coordinator { Coordinator(pageIndex: $pageIndex, onSelection: onSelection) }

    private func configuredView(context: Context) -> PDFView {
        let view = PDFView(); context.coordinator.configure(view, url: url); return view
    }
}

extension PDFKitView {
    @MainActor
    final class Coordinator: NSObject {
        @Binding private var pageIndex: Int
        nonisolated(unsafe) private var observer: NSObjectProtocol?
        nonisolated(unsafe) private var selectionObserver: NSObjectProtocol?
        private let onSelection: (Int, CGRect, String) -> Void
        init(pageIndex: Binding<Int>, onSelection: @escaping (Int, CGRect, String) -> Void) {
            _pageIndex = pageIndex
            self.onSelection = onSelection
        }

        func configure(_ view: PDFView, url: URL) {
            view.document = PDFDocument(url: url)
            view.autoScales = true
            view.displayMode = .singlePageContinuous
            view.displayDirection = .vertical
            observer = NotificationCenter.default.addObserver(
                forName: .PDFViewPageChanged, object: view, queue: .main
            ) { [weak self, weak view] _ in
                MainActor.assumeIsolated {
                    guard let view, let page = view.currentPage else { return }
                    self?.pageIndex = view.document?.index(for: page) ?? 0
                }
            }
            selectionObserver = NotificationCenter.default.addObserver(
                forName: .PDFViewSelectionChanged, object: view, queue: .main
            ) { [weak self, weak view] _ in
                MainActor.assumeIsolated {
                    guard let self, let view, let selection = view.currentSelection,
                          let page = selection.pages.first, let document = view.document else { return }
                    let pageBounds = page.bounds(for: .cropBox)
                    let bounds = selection.bounds(for: page)
                    let normalized = CGRect(
                        x: bounds.minX / pageBounds.width, y: bounds.minY / pageBounds.height,
                        width: bounds.width / pageBounds.width, height: bounds.height / pageBounds.height
                    )
                    self.onSelection(document.index(for: page), normalized, selection.string ?? "")
                }
            }
        }

        func update(_ view: PDFView, pageIndex: Int, highlights: [Highlight]) {
            if let page = view.document?.page(at: pageIndex), view.currentPage != page { view.go(to: page) }
            apply(highlights, to: view)
        }

        private func apply(_ highlights: [Highlight], to view: PDFView) {
            guard let document = view.document else { return }
            for pageIndex in 0..<document.pageCount {
                guard let page = document.page(at: pageIndex) else { continue }
                for annotation in page.annotations where annotation.userName == "DocPilotHighlight" {
                    page.removeAnnotation(annotation)
                }
            }
            for item in highlights {
                guard let page = document.page(at: item.pageIndex) else { continue }
                let pageBounds = page.bounds(for: .cropBox)
                let bounds = CGRect(
                    x: item.x * pageBounds.width, y: item.y * pageBounds.height,
                    width: item.width * pageBounds.width, height: item.height * pageBounds.height
                )
                let annotation = PDFAnnotation(bounds: bounds, forType: .highlight, withProperties: nil)
                annotation.userName = "DocPilotHighlight"
                page.addAnnotation(annotation)
            }
        }

        deinit {
            if let observer { NotificationCenter.default.removeObserver(observer) }
            if let selectionObserver { NotificationCenter.default.removeObserver(selectionObserver) }
        }
    }
}

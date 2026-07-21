import SwiftUI

struct WorkspaceShell: View {
    @Bindable var documentsModel: DocumentsModel

    var body: some View {
#if os(macOS)
        splitView
#else
        AdaptiveWorkspaceShell(documentsModel: documentsModel)
#endif
    }

    private var splitView: some View {
        NavigationSplitView {
            List { Label("资料库", systemImage: "books.vertical") }
                .navigationTitle("DocPilot")
        } content: {
            DocumentsView(model: documentsModel)
        } detail: {
            DocumentDestination(documentID: documentsModel.selectedDocumentID)
        }
    }
}

#if os(iOS)
private struct AdaptiveWorkspaceShell: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Bindable var documentsModel: DocumentsModel

    var body: some View {
        if sizeClass == .regular {
            NavigationSplitView {
                List { Label("资料库", systemImage: "books.vertical") }
            } content: {
                DocumentsView(model: documentsModel)
            } detail: {
                DocumentDestination(documentID: documentsModel.selectedDocumentID)
            }
        } else {
            TabView {
                NavigationStack { DocumentsView(model: documentsModel) }
                    .tabItem { Label("文档", systemImage: "doc.text") }
                NavigationStack { ContentUnavailableView("搜索", systemImage: "magnifyingglass") }
                    .tabItem { Label("搜索", systemImage: "magnifyingglass") }
                NavigationStack { ContentUnavailableView("账户", systemImage: "person.crop.circle") }
                    .tabItem { Label("账户", systemImage: "person.crop.circle") }
            }
        }
    }
}
#endif

private struct DocumentDestination: View {
    let documentID: String?
    var body: some View {
        if let documentID {
            ContentUnavailableView("文档 \(documentID)", systemImage: "doc.richtext")
        } else {
            ContentUnavailableView("选择一份文档", systemImage: "doc.richtext")
        }
    }
}

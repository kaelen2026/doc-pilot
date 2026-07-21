import SwiftUI

struct WorkspaceShell: View {
    @Bindable var documentsModel: DocumentsModel
    let userID: String
    let api: APIClient

    var body: some View {
#if os(macOS)
        splitView
#else
        AdaptiveWorkspaceShell(documentsModel: documentsModel, userID: userID, api: api)
#endif
    }

    private var splitView: some View {
        NavigationSplitView {
            List { Label("资料库", systemImage: "books.vertical") }
                .navigationTitle("DocPilot")
        } content: {
            DocumentsView(model: documentsModel)
        } detail: {
            DocumentDestination(documentID: documentsModel.selectedDocumentID, userID: userID, api: api)
        }
    }
}

#if os(iOS)
private struct AdaptiveWorkspaceShell: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Bindable var documentsModel: DocumentsModel
    let userID: String
    let api: APIClient

    var body: some View {
        if sizeClass == .regular {
            NavigationSplitView {
                List { Label("资料库", systemImage: "books.vertical") }
            } content: {
                DocumentsView(model: documentsModel)
            } detail: {
                DocumentDestination(documentID: documentsModel.selectedDocumentID, userID: userID, api: api)
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
    let userID: String
    let api: APIClient
    var body: some View {
        if let documentID {
            ReaderChatSplitView(documentID: documentID, userID: userID, api: api)
        } else {
            ContentUnavailableView("选择一份文档", systemImage: "doc.richtext")
        }
    }
}

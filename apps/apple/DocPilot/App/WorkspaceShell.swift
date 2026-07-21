import SwiftUI

struct WorkspaceShell: View {
    enum Section: Hashable { case documents, search, notifications, account }

    @Bindable var documentsModel: DocumentsModel
    @State private var searchModel: SearchModel
    @State private var notificationsModel: NotificationsModel
    @State private var accountModel: AccountModel
    @State private var selection: Section = .documents
    let userID: String
    let api: APIClient

    init(documentsModel: DocumentsModel, userID: String, api: APIClient,
         signOut: @escaping () async -> Void) {
        self.documentsModel = documentsModel
        self.userID = userID
        self.api = api
        _searchModel = State(initialValue: SearchModel(api: api))
        _notificationsModel = State(initialValue: NotificationsModel(api: api))
        _accountModel = State(initialValue: AccountModel(api: api, signOut: signOut))
    }

    var body: some View {
#if os(macOS)
        NavigationSplitView {
            List(selection: $selection) {
                Label("资料库", systemImage: "books.vertical").tag(Section.documents)
                Label("搜索", systemImage: "magnifyingglass").tag(Section.search)
                Label("通知", systemImage: "bell").tag(Section.notifications)
                Label("账户", systemImage: "person.crop.circle").tag(Section.account)
            }.navigationTitle("DocPilot")
        } content: {
            sectionView
        } detail: {
            DocumentDestination(documentID: documentsModel.selectedDocumentID, userID: userID, api: api)
        }
#else
        if UIDevice.current.userInterfaceIdiom == .pad {
            NavigationSplitView {
                List {
                    Button { selection = .documents } label: { Label("资料库", systemImage: "books.vertical") }
                    Button { selection = .search } label: { Label("搜索", systemImage: "magnifyingglass") }
                    Button { selection = .notifications } label: { Label("通知", systemImage: "bell") }
                    Button { selection = .account } label: { Label("账户", systemImage: "person.crop.circle") }
                }
            } content: { sectionView } detail: {
                DocumentDestination(documentID: documentsModel.selectedDocumentID, userID: userID, api: api)
            }
        } else {
            TabView(selection: $selection) {
                NavigationStack { DocumentsView(model: documentsModel) }
                    .tabItem { Label("文档", systemImage: "doc.text") }.tag(Section.documents)
                NavigationStack { searchView }
                    .tabItem { Label("搜索", systemImage: "magnifyingglass") }.tag(Section.search)
                NavigationStack { notificationsView }
                    .tabItem { Label("通知", systemImage: "bell") }.tag(Section.notifications)
                    .badge(notificationsModel.unreadCount)
                NavigationStack { AccountView(model: accountModel) }
                    .tabItem { Label("账户", systemImage: "person.crop.circle") }.tag(Section.account)
            }
        }
#endif
    }

    @ViewBuilder private var sectionView: some View {
        switch selection {
        case .documents: DocumentsView(model: documentsModel)
        case .search: searchView
        case .notifications: notificationsView
        case .account: AccountView(model: accountModel)
        }
    }

    private var searchView: some View {
        SearchView(model: searchModel) { openDocument($0) }
    }

    private var notificationsView: some View {
        NotificationsView(model: notificationsModel) { openDocument($0) }
    }

    private func openDocument(_ id: String) {
        documentsModel.selectedDocumentID = id
        selection = .documents
    }
}

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

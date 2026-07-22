import SwiftUI

struct WorkspaceShell: View {
    enum Section: Hashable { case documents, search, notifications, account }

    @Bindable var documentsModel: DocumentsModel
    @State private var searchModel: SearchModel
    @State private var notificationsModel: NotificationsModel
    @State private var accountModel: AccountModel
    @State private var selection: Section
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
        _selection = State(initialValue: Self.initialSection())
    }

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                DocumentsView(model: documentsModel)
                    .navigationDestination(item: $documentsModel.selectedDocumentID) { id in
                        DocumentWorkspaceView(documentID: id, userID: userID, api: api)
                    }
            }
            .tabItem { Label("文档", systemImage: "doc.text") }.tag(Section.documents)

            NavigationStack { searchView }
                .tabItem { Label("搜索", systemImage: "magnifyingglass") }.tag(Section.search)

            NavigationStack { notificationsView }
                .tabItem { Label("通知", systemImage: "bell") }.tag(Section.notifications)
                .badge(notificationsModel.unreadCount)

            NavigationStack { AccountView(model: accountModel) }
                .tabItem { Label("账户", systemImage: "person.crop.circle") }.tag(Section.account)
        }
        .tabBarMinimizeBehavior(.onScrollDown)
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

    /// 截图/联调用:`-initialTab search|notifications|account` 指定启动 tab,默认文档。
    private static func initialSection() -> Section {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-initialTab"), index + 1 < args.count else {
            return .documents
        }
        switch args[index + 1] {
        case "search": return .search
        case "notifications": return .notifications
        case "account": return .account
        default: return .documents
        }
    }
}

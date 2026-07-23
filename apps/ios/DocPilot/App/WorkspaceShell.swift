import SwiftUI

struct WorkspaceShell: View {
    enum Section: Hashable { case documents, account }

    @Bindable var documentsModel: DocumentsModel
    @State private var searchModel: SearchModel
    @State private var notificationsModel: NotificationsModel
    @State private var accountModel: AccountModel
    @State private var selection: Section
    @Environment(\.scenePhase) private var scenePhase
    let userID: String
    let api: APIClient
    let pushRegistration: PushRegistrationModel

    init(documentsModel: DocumentsModel, userID: String, api: APIClient,
         pushRegistration: PushRegistrationModel, signOut: @escaping () async -> Void) {
        self.documentsModel = documentsModel
        self.userID = userID
        self.api = api
        self.pushRegistration = pushRegistration
        _searchModel = State(initialValue: SearchModel(api: api))
        _notificationsModel = State(initialValue: NotificationsModel(api: api))
        _accountModel = State(initialValue: AccountModel(api: api, signOut: signOut))
        _selection = State(initialValue: Self.initialSection())
    }

    var body: some View {
        // 上传已从 tab bar 移到文档页左上角(见 DocumentsView 工具栏),故这里只剩文档 / 账户两个 tab。
        TabView(selection: $selection) {
            NavigationStack {
                DocumentsView(model: documentsModel, searchModel: searchModel,
                              notificationsModel: notificationsModel, openDocument: openDocument)
                    .navigationDestination(item: $documentsModel.selectedDocumentID) { id in
                        DocumentWorkspaceView(documentID: id, userID: userID, api: api)
                    }
            }
            .tabItem { Label("文档", systemImage: "doc.text") }.tag(Section.documents)

            NavigationStack { AccountView(model: accountModel) }
                .tabItem { Label("账户", systemImage: "person.crop.circle") }.tag(Section.account)
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .task {
            // 仅在登录后(WorkspaceShell 存在即已登录)申请通知权限并注册推送。
            // activate 幂等 + 权限一次性 guard,故 .task 在视图重建后重跑无副作用。
            await pushRegistration.activate(client: PushClient(api: api))
        }
        .onChange(of: scenePhase) { _, phase in
            // 回到前台即重新拉取真实未读数并经模型同步系统角标,清掉推送残留的 stale 红点。
            // 打开 app 与点击推送(推送点击会把 app 带前台)都会触发;load() 幂等,重跑无副作用。
            guard phase == .active else { return }
            Task { await notificationsModel.load() }
        }
    }

    private func openDocument(_ id: String) {
        documentsModel.selectedDocumentID = id
        selection = .documents
    }

    /// 截图/联调用:`-initialTab account` 指定启动 tab,默认文档。
    private static func initialSection() -> Section {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-initialTab"), index + 1 < args.count else {
            return .documents
        }
        switch args[index + 1] {
        case "account": return .account
        default: return .documents
        }
    }
}

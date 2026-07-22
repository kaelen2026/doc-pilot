import SwiftUI
import SwiftData

@main
struct DocPilotApp: App {
    private let environment = AppEnvironment.live

    init() { AppAppearance.apply() }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
                .tint(DesignTokens.seal)
        }
        .modelContainer(for: Highlight.self)
    }
}

private struct RootView: View {
    let environment: AppEnvironment
    @State private var loginModel: LoginModel
    @State private var documentsModel: DocumentsModel
    private let api: APIClient

    init(environment: AppEnvironment) {
        self.environment = environment
        let tokenStore = KeychainStore()
        let api = APIClient(
            baseURL: environment.apiBaseURL,
            transport: URLSessionTransport(),
            token: { try? tokenStore.loadToken() }
        )
        self.api = api
        _loginModel = State(initialValue: LoginModel(
            authClient: AuthClient(api: api, tokenStore: tokenStore)
        ))
        _documentsModel = State(initialValue: DocumentsModel(
            client: DocumentsClient(api: api), uploader: UploadClient(api: api)
        ))
    }

    var body: some View {
        Group {
            if loginModel.session == nil {
                LoginView(model: loginModel)
            } else {
                WorkspaceShell(
                    documentsModel: documentsModel,
                    userID: loginModel.session?.user.id ?? "",
                    api: api,
                    signOut: { await loginModel.signOut() }
                )
            }
        }
        .task {
            // 截图/联调用:-forceLoggedOut 跳过会话恢复以展示登录流(生产无副作用)。
            if !ProcessInfo.processInfo.arguments.contains("-forceLoggedOut") {
                await loginModel.restore()
            }
        }
    }
}

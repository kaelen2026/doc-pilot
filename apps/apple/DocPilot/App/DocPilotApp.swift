import SwiftUI

@main
struct DocPilotApp: App {
    private let environment = AppEnvironment.live

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
                .tint(DesignTokens.accent)
        }
    }
}

private struct RootView: View {
    let environment: AppEnvironment
    @State private var loginModel: LoginModel
    @State private var documentsModel: DocumentsModel

    init(environment: AppEnvironment) {
        self.environment = environment
        let tokenStore = KeychainStore()
        let api = APIClient(
            baseURL: environment.apiBaseURL,
            transport: URLSessionTransport(),
            token: { try? tokenStore.loadToken() }
        )
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
                WorkspaceShell(documentsModel: documentsModel)
            }
        }
        .task { await loginModel.restore() }
    }
}

import SwiftUI
import SwiftData

@main
struct DocPilotApp: App {
    // 挂 AppDelegate 仅为接收 APNS 系统回调(device token / 前台展示),App 仍是纯 SwiftUI 生命周期。
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    private let environment = AppEnvironment.live
    @AppStorage(SettingsKeys.appearance) private var appearanceRaw = AppearancePreference.system.rawValue

    init() { AppAppearance.apply() }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment, pushRegistration: appDelegate.pushRegistration)
                .tint(DesignTokens.seal)
                .preferredColorScheme(AppearancePreference.from(appearanceRaw).colorScheme)
        }
        .modelContainer(for: Highlight.self)
    }
}

private struct RootView: View {
    let environment: AppEnvironment
    let pushRegistration: PushRegistrationModel
    @State private var loginModel: LoginModel
    @State private var documentsModel: DocumentsModel
    private let api: APIClient

    init(environment: AppEnvironment, pushRegistration: PushRegistrationModel) {
        self.environment = environment
        self.pushRegistration = pushRegistration
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
                    pushRegistration: pushRegistration,
                    // 退出登录前 best-effort 注销本机 token,再清会话。
                    signOut: {
                        await pushRegistration.deactivate()
                        await loginModel.signOut()
                    }
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

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

    init(environment: AppEnvironment) {
        self.environment = environment
        let api = APIClient(baseURL: environment.apiBaseURL, transport: URLSessionTransport())
        _loginModel = State(initialValue: LoginModel(
            authClient: AuthClient(api: api, tokenStore: KeychainStore())
        ))
    }

    var body: some View {
        Group {
            if loginModel.session == nil {
                LoginView(model: loginModel)
            } else {
#if os(macOS)
                WorkspaceSplitView()
#else
                AdaptiveWorkspaceView()
#endif
            }
        }
        .task { await loginModel.restore() }
    }
}

#if os(iOS)
private struct AdaptiveWorkspaceView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        if horizontalSizeClass == .regular {
            WorkspaceSplitView()
        } else {
            TabView {
                NavigationStack { PlaceholderView(title: "文档", symbol: "doc.text") }
                    .tabItem { Label("文档", systemImage: "doc.text") }
                NavigationStack { PlaceholderView(title: "搜索", symbol: "magnifyingglass") }
                    .tabItem { Label("搜索", systemImage: "magnifyingglass") }
                NavigationStack { PlaceholderView(title: "账户", symbol: "person.crop.circle") }
                    .tabItem { Label("账户", systemImage: "person.crop.circle") }
            }
        }
    }
}
#endif

private struct WorkspaceSplitView: View {
    var body: some View {
        NavigationSplitView {
            List { Label("文档", systemImage: "doc.text") }
                .navigationTitle("DocPilot")
        } content: {
            PlaceholderView(title: "文档", symbol: "doc.text")
        } detail: {
            PlaceholderView(title: "选择一份文档", symbol: "doc.richtext")
        }
    }
}

private struct PlaceholderView: View {
    let title: String
    let symbol: String

    var body: some View {
        ContentUnavailableView(title, systemImage: symbol)
            .background(DesignTokens.paper)
            .foregroundStyle(DesignTokens.ink)
            .accessibilityIdentifier("workspace.\(title)")
    }
}

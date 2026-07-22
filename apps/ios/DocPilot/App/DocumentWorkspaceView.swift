import SwiftUI

/// iPhone 文档工作区:阅读全屏,问答走 Liquid Glass sheet。
/// (原 iPad/mac 左右分屏已随「只做 iOS」下线,分屏代码删除。)
struct DocumentWorkspaceView: View {
    let documentID: String
    let userID: String
    let api: APIClient
    @State private var requestedPage = 0
    @State private var showChat = false

    var body: some View {
        ReaderView(documentID: documentID, userID: userID, api: api, requestedPage: $requestedPage)
            .navigationTitle("阅读")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .overlay(alignment: .bottomTrailing) {
                Button { showChat = true } label: {
                    Label("问答", systemImage: "bubble.left.and.bubble.right.fill")
                        .font(.callout.weight(.medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.glassProminent)
                .tint(DesignTokens.seal)
                .padding(20)
                .accessibilityIdentifier("document.openChat")
            }
            .sheet(isPresented: $showChat) {
                NavigationStack {
                    ChatView(documentID: documentID, api: api) { page in
                        requestedPage = page
                        showChat = false
                    }
                    .navigationTitle("问答")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("完成") { showChat = false }
                        }
                    }
                }
                .presentationDetents([.large, .medium])
                .presentationBackground(DesignTokens.paper)
            }
            // 截图/联调用:-openChat 自动打开问答 sheet(受启动参数保护,生产无副作用)。
            .task {
                if ProcessInfo.processInfo.arguments.contains("-openChat") { showChat = true }
            }
    }
}

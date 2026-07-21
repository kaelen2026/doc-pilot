import SwiftUI

struct ReaderChatSplitView: View {
    let documentID: String
    let userID: String
    let api: APIClient
    @State private var requestedPage = 0

    var body: some View {
        GeometryReader { proxy in
            if proxy.size.width >= 760 {
                HStack(spacing: 0) {
                    ReaderView(documentID: documentID, userID: userID, api: api, requestedPage: $requestedPage)
                        .frame(minWidth: 360)
                    ChatView(documentID: documentID, api: api) { requestedPage = $0 }
                        .frame(minWidth: 320, idealWidth: 400)
                }
            } else {
                TabView {
                    ReaderView(documentID: documentID, userID: userID, api: api, requestedPage: $requestedPage)
                        .tabItem { Label("阅读", systemImage: "doc.text") }
                    ChatView(documentID: documentID, api: api) { requestedPage = $0 }
                        .tabItem { Label("问答", systemImage: "bubble.left.and.bubble.right") }
                }
            }
        }
    }
}

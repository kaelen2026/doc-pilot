import SwiftUI

struct AccountView: View {
    @Bindable var model: AccountModel

    var body: some View {
        Form {
            if let me = model.me {
                Section("账户") {
                    LabeledContent("姓名", value: me.user.name)
                    LabeledContent("邮箱", value: me.user.email)
                }
                Section("工作区") {
                    ForEach(me.workspaces, id: \.id) { workspace in
                        LabeledContent(workspace.name, value: workspace.role)
                    }
                }
            }
            if let usage = model.usage {
                Section("本月用量") {
                    UsageRow(title: "文档", amount: usage.documentCount)
                    UsageRow(title: "提问", amount: usage.monthlyQuestions)
                    UsageRow(title: "AI Token", amount: usage.monthlyAiTokens)
                    UsageRow(title: "存储", amount: usage.storageBytes)
                }
            }
            Section { Button("退出登录", role: .destructive) { Task { await model.signOut() } } }
        }
        .navigationTitle("账户")
        .task { await model.load() }
    }
}

private struct UsageRow: View {
    let title: String
    let amount: UsageResponse.Amount
    var body: some View {
        VStack(alignment: .leading) {
            LabeledContent(title, value: "\(amount.used) / \(amount.limit)")
            ProgressView(value: Double(amount.used), total: Double(max(amount.limit, 1)))
        }
    }
}

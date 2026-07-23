import SwiftUI

struct AccountView: View {
    @Bindable var model: AccountModel
    @State private var showSettings = false
    @State private var showScanLogin = false
    @State private var showDeleteConfirm = false
    @State private var showDeletionRequested = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DesignTokens.spacingLg) {
                if let me = model.me {
                    profileCard(name: me.user.name, email: me.user.email)
                    if !me.workspaces.isEmpty {
                        VStack(alignment: .leading, spacing: DesignTokens.spacingSm) {
                            sectionHeader("工作区")
                            VStack(spacing: 0) {
                                ForEach(Array(me.workspaces.enumerated()), id: \.element.id) { index, workspace in
                                    if index > 0 { Divider().overlay(DesignTokens.hairline) }
                                    HStack {
                                        Text(workspace.name).font(.body).foregroundStyle(DesignTokens.ink)
                                        Spacer(minLength: 8)
                                        Text(roleLabel(workspace.role))
                                            .font(.caption.weight(.medium))
                                            .foregroundStyle(DesignTokens.seal)
                                            .padding(.horizontal, 8).padding(.vertical, 3)
                                            .background(DesignTokens.seal.opacity(0.12), in: Capsule())
                                    }
                                    .padding(.vertical, 12)
                                    .padding(.horizontal, 16)
                                }
                            }
                            .cardSurface()
                        }
                    }
                }

                if let usage = model.usage {
                    VStack(alignment: .leading, spacing: DesignTokens.spacingSm) {
                        sectionHeader("本月用量")
                        VStack(spacing: 18) {
                            UsageRow(title: "文档", used: usage.documentCount.used, limit: usage.documentCount.limit)
                            UsageRow(title: "提问", used: usage.monthlyQuestions.used, limit: usage.monthlyQuestions.limit)
                            UsageRow(title: "AI Token", used: usage.monthlyAiTokens.used, limit: usage.monthlyAiTokens.limit)
                            UsageRow(title: "存储", used: usage.storageBytes.used, limit: usage.storageBytes.limit, isBytes: true)
                        }
                        .padding(16)
                        .cardSurface()
                    }
                }

                VStack(alignment: .leading, spacing: DesignTokens.spacingSm) {
                    sectionHeader("网页版")
                    Button { showScanLogin = true } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "qrcode.viewfinder")
                                .font(.title3).foregroundStyle(DesignTokens.seal)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("扫码登录网页版").font(.body).foregroundStyle(DesignTokens.ink)
                                Text("扫描电脑上的二维码,在手机确认登录")
                                    .font(.caption).foregroundStyle(DesignTokens.inkSoft)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.footnote).foregroundStyle(DesignTokens.inkFaint)
                        }
                        .padding(.vertical, 12).padding(.horizontal, 16)
                    }
                    .buttonStyle(.plain)
                    .cardSurface()
                    .accessibilityIdentifier("account.scanLogin")
                }

                Button(role: .destructive) {
                    Task { await model.signOut() }
                } label: {
                    Text("退出登录")
                        .font(.body.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.glass)
                .tint(DesignTokens.seal)
                .padding(.top, DesignTokens.spacingSm)

                deletionSection()
            }
            .padding()
        }
        .background(DesignTokens.paper)
        // 请求注销成功后先给一句明确提示,用户确认后再登出回登录页(账户已冻结)。
        .alert("账户已进入注销冷静期", isPresented: $showDeletionRequested) {
            Button("好") { Task { await model.signOut() } }
        } message: {
            Text("7 天内重新登录即可撤销注销;到期后你的文档、对话与全部数据将被永久删除。")
        }
        .navigationTitle("账户")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape").accessibilityLabel("设置")
                }
                .accessibilityIdentifier("account.settings")
            }
        }
        .navigationDestination(isPresented: $showSettings) { SettingsView() }
        .sheet(isPresented: $showScanLogin) { ScanLoginView(client: model.scanLogin) }
        .task { await model.load() }
    }

    // 注销区:冷静期内显示撤销入口,否则显示删除入口(互斥,早返回不用嵌套三元)。
    @ViewBuilder
    private func deletionSection() -> some View {
        if model.isPendingDeletion {
            restoreBanner()
        } else {
            deleteButton()
        }
    }

    @ViewBuilder
    private func deleteButton() -> some View {
        VStack(spacing: DesignTokens.spacingSm) {
            Button("删除账户", role: .destructive) { showDeleteConfirm = true }
                .font(.callout)
                .disabled(model.isDeletingAccount)
                // iOS 26 的 confirmationDialog 以来源视图为锚:必须挂在具体按钮上,
                // 挂到外层 ScrollView/容器会锚到左上角错位(见 apple-ios26-swiftui-gotchas)。
                .confirmationDialog("删除账户?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                    Button("删除账户", role: .destructive) {
                        Task { if await model.requestDeletion() { showDeletionRequested = true } }
                    }
                } message: {
                    Text("账户将进入 7 天冷静期,期间重新登录即可撤销。到期后你的文档、对话与全部数据将被永久删除,无法恢复。")
                }
                .accessibilityIdentifier("account.deleteAccount")

            if let error = model.deletionErrorMessage {
                Text(error).font(.caption).foregroundStyle(DesignTokens.seal)
            }
        }
        .padding(.top, DesignTokens.spacingSm)
    }

    @ViewBuilder
    private func restoreBanner() -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingSm) {
            sectionHeader("账户注销")
            VStack(alignment: .leading, spacing: 10) {
                Text("账户正在注销冷静期")
                    .font(.body.weight(.medium)).foregroundStyle(DesignTokens.seal)
                if let scheduledAt = model.me?.deletionScheduledAt {
                    Text("将于 \(AccountDeletion.scheduledDateText(scheduledAt)) 被永久删除,现在撤销即可恢复账户与全部数据。")
                        .font(.subheadline).foregroundStyle(DesignTokens.inkSoft)
                }
                Button { Task { await model.cancelDeletion() } } label: {
                    Text(model.isRestoring ? "撤销中…" : "撤销注销")
                        .font(.body.weight(.medium))
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.glass)
                .tint(DesignTokens.seal)
                .disabled(model.isRestoring)
                .accessibilityIdentifier("account.cancelDeletion")
                if let error = model.deletionErrorMessage {
                    Text(error).font(.caption).foregroundStyle(DesignTokens.seal)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
        .padding(.top, DesignTokens.spacingSm)
    }

    private func profileCard(name: String, email: String) -> some View {
        HStack(spacing: 14) {
            Text(String(name.prefix(1)).uppercased())
                .font(DesignTokens.display(22))
                .foregroundStyle(DesignTokens.seal)
                .frame(width: 52, height: 52)
                .background(DesignTokens.seal.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.headline).foregroundStyle(DesignTokens.ink)
                Text(email).font(.subheadline).foregroundStyle(DesignTokens.inkSoft)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(DesignTokens.inkFaint)
            .textCase(.uppercase)
            .padding(.leading, 4)
    }

    private func roleLabel(_ role: String) -> String {
        switch role {
        case "owner": "所有者"
        case "admin": "管理员"
        case "member": "成员"
        default: role
        }
    }
}

private struct UsageRow: View {
    let title: String
    let used: Int
    let limit: Int
    var isBytes = false

    private var fraction: Double { Double(used) / Double(max(limit, 1)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(title).font(.subheadline).foregroundStyle(DesignTokens.ink)
                Spacer()
                Text("\(format(used)) / \(format(limit))")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(DesignTokens.inkSoft)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DesignTokens.paperSunken)
                    Capsule().fill(DesignTokens.seal)
                        .frame(width: max(4, proxy.size.width * min(1, fraction)))
                }
            }
            .frame(height: 6)
        }
    }

    private func format(_ value: Int) -> String {
        if isBytes { return ByteCountFormatter.string(fromByteCount: Int64(value), countStyle: .file) }
        return value.formatted(.number.grouping(.automatic))
    }
}

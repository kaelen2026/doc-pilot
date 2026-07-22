import SwiftUI

struct AccountView: View {
    @Bindable var model: AccountModel
    @State private var showSettings = false
    @State private var showScanLogin = false

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
            }
            .padding()
        }
        .background(DesignTokens.paper)
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

import SwiftData
import SwiftUI

/// 设置页(从账户页 push 进入):外观主题、通知偏好、存储、关于与版本。
struct SettingsView: View {
    @AppStorage(SettingsKeys.appearance) private var appearanceRaw = AppearancePreference.system.rawValue
    @AppStorage(SettingsKeys.liveNotifications) private var liveNotifications = true
    @Environment(\.modelContext) private var modelContext
    @State private var model = SettingsModel()
    @State private var highlightCount = 0
    @State private var confirmClearCache = false
    @State private var confirmClearHighlights = false

    private var appearance: Binding<AppearancePreference> {
        Binding(
            get: { AppearancePreference.from(appearanceRaw) },
            set: { appearanceRaw = $0.rawValue }
        )
    }

    var body: some View {
        Form {
            Section("外观") {
                Picker("主题", selection: appearance) {
                    ForEach(AppearancePreference.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section {
                Toggle("实时通知更新", isOn: $liveNotifications)
            } header: {
                Text("通知")
            } footer: {
                Text("关闭后不再保持实时连接,进入通知页时手动刷新。")
            }

            Section {
                LabeledContent("文档缓存", value: model.cacheText)
                Button("清除文档缓存") { confirmClearCache = true }
                    .disabled(model.cacheBytes == 0 || model.isClearingCache)
                Button("清除全部高亮", role: .destructive) { confirmClearHighlights = true }
                    .disabled(highlightCount == 0)
            } header: {
                Text("存储")
            } footer: {
                Text("本机高亮 \(highlightCount) 条。清除仅影响本设备缓存,不影响云端文档。")
            }

            Section("关于") {
                LabeledContent("版本", value: model.versionText)
                LabeledContent("服务地址", value: model.apiHost)
            }
        }
        .paperBackground()
        .tint(DesignTokens.seal)
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.refreshCacheSize()
            highlightCount = (try? HighlightStore(context: modelContext).count()) ?? 0
        }
        .confirmationDialog("清除文档缓存?", isPresented: $confirmClearCache, titleVisibility: .visible) {
            Button("清除 \(model.cacheText)", role: .destructive) { Task { await model.clearCache() } }
        } message: {
            Text("已下载的 PDF 将从本机删除,下次打开时重新下载。")
        }
        .confirmationDialog("清除全部高亮?", isPresented: $confirmClearHighlights, titleVisibility: .visible) {
            Button("清除 \(highlightCount) 条高亮", role: .destructive) {
                try? HighlightStore(context: modelContext).deleteAll()
                highlightCount = 0
            }
        } message: {
            Text("本机所有文档的高亮将被删除,且不可恢复。")
        }
    }
}

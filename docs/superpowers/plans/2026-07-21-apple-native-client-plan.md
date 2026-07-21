# Apple 原生客户端实施计划

> 设计依据：[`2026-07-21-apple-native-client-design.md`](../specs/2026-07-21-apple-native-client-design.md)

## 实施原则

- 使用 5 个顺序 PR，每个 PR 都能独立构建、测试和回滚；前一个合并后再从 `main` 创建下一个。
- 可测核心逻辑先写失败测试，再写最小实现；SwiftUI 展示层保持薄，不为了覆盖率引入复杂 View 测试。
- iOS/iPadOS 17、macOS 14 为最低版本，开发与 CI 使用 Xcode 26、Swift 6 语言模式。
- 原生客户端只通过公开 API 访问数据；`workspace_id`、配额、限流、幂等和 AI Gateway 不变量保持在服务端。
- 每个 PR 合并前同时保持 Node/Web 现有门禁和 Apple build/test 绿色。

## PR 1：认证、契约与工程骨架

### 1.1 Better Auth Bearer Session

**修改文件**

- `packages/auth/src/auth.ts`
- `packages/auth/package.json`
- `packages/auth/src/auth.test.ts`（新增）
- `apps/api/src/middleware/auth.middleware.test.ts`
- `docs/architecture/cross-cutting.md`

**步骤**

1. 为 auth package 接入 Vitest，在测试中通过 OTP 登录响应取得 `set-auth-token`，先证明当前实现不提供 Bearer Token。
2. 给 Better Auth 增加官方 `bearer({ requireSignature: true })` 插件。
3. 增加 API 鉴权测试：Bearer 请求能解析 session；非法、过期或缺失 Token 返回 401；Cookie 路径保持可用。
4. 验证 Web 客户端无需增加 bearer client plugin，仍只使用 Cookie。
5. 在横切文档补充 Web Cookie 与 Apple Bearer 双接线，以及 Token 不得进入日志的要求。

**验证**

```bash
pnpm --filter @doc-pilot/auth test
pnpm --filter @doc-pilot/api test
pnpm --filter @doc-pilot/api typecheck
```

### 1.2 双端契约 Fixtures

**新增文件**

- `packages/contracts/fixtures/apple/auth/*.json`
- `packages/contracts/fixtures/apple/documents/*.json`
- `packages/contracts/fixtures/apple/chat/*.jsonl`
- `packages/contracts/src/apple-fixtures.test.ts`

**步骤**

1. 为 session、`/me`、文档列表/详情、创建上传、会话、消息页、搜索、通知及 Chat SSE 建立去敏 fixture。
2. TypeScript 测试用现有常量和 DTO 约束 fixture 的枚举、事件名、分页上限和可选字段。
3. fixture 中不保存真实 Cookie、Bearer Token、OTP、预签名 URL 凭据或用户数据。

### 1.3 XcodeGen 工程

**新增文件**

- `apps/apple/project.yml`
- `apps/apple/DocPilot.xcodeproj/**`
- `apps/apple/Config/Debug.xcconfig`
- `apps/apple/Config/Release.xcconfig`
- `apps/apple/DocPilot/App/DocPilotApp.swift`
- `apps/apple/DocPilot/App/AppEnvironment.swift`
- `apps/apple/DocPilot/SharedUI/DesignTokens.swift`
- `apps/apple/DocPilotTests/SmokeTests.swift`
- `.github/workflows/apple.yml`
- `apps/apple/README.md`

**步骤**

1. 配置 multiplatform App、unit test 与 UI test targets；bundle ID 使用 `com.docpilot.app`，签名配置不提交团队 ID。
2. API Base URL 从 `.xcconfig` 注入：Debug 默认本机 API，Release 必须由构建环境提供 HTTPS URL。
3. 建立 iPhone/iPad `TabView + NavigationStack` 与 iPad/Mac `NavigationSplitView` 的空壳。
4. 建立墨水纸语义 token、加载/空/错误状态原语和基础可访问性标签。
5. 生成 `.xcodeproj` 并提交；增加 `scripts/apple/check-project.sh` 验证重新生成无差异。

**验证**

```bash
xcodegen generate --spec apps/apple/project.yml
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot -destination 'platform=macOS' build
```

### 1.4 Core Networking 与认证

**新增文件**

- `apps/apple/DocPilot/Core/Networking/APIClient.swift`
- `apps/apple/DocPilot/Core/Networking/APIError.swift`
- `apps/apple/DocPilot/Core/Networking/HTTPTransport.swift`
- `apps/apple/DocPilot/Core/Auth/AuthClient.swift`
- `apps/apple/DocPilot/Core/Auth/KeychainStore.swift`
- `apps/apple/DocPilot/Features/Authentication/LoginModel.swift`
- `apps/apple/DocPilot/Features/Authentication/LoginView.swift`
- 对应 `DocPilotTests/Core/**` 与 `DocPilotTests/Features/Authentication/**`

**测试先行**

1. 用注入的 `HTTPTransport` 钉住 URL、JSON、Bearer header、错误映射和取消语义。
2. 用 Keychain protocol fake 钉住 Token 只写 Keychain、401 清理与退出登录。
3. 用 auth fixtures 钉住 OTP 发送、验证、`set-auth-token` 读取和 session 恢复。
4. 实现登录两步 UI、启动 session gate 和未登录/已登录路由。

## PR 2：工作台、文档与上传

### 2.1 Swift DTO 与文档列表

**新增文件**

- `apps/apple/DocPilot/Core/Contracts/{Auth,Documents,Account}.swift`
- `apps/apple/DocPilot/Features/Documents/DocumentsClient.swift`
- `apps/apple/DocPilot/Features/Documents/DocumentsModel.swift`
- `apps/apple/DocPilot/Features/Documents/DocumentsView.swift`
- `apps/apple/DocPilot/App/WorkspaceShell.swift`
- 对应 fixture 解码与 model 测试

**步骤**

1. 先用共享 fixture 写 Swift 解码测试，覆盖所有字符串状态和服务端可选字段。
2. 实现文档列表、加载/空/失败、手动刷新及处理中轮询；轮询随 Scene phase 暂停。
3. iPhone 显示 Tab/Stack；iPad/Mac 显示功能栏 + 文档列表 + 内容三栏。
4. 列表选中态和导航只保存 ID，不复制服务端 Document 为本地事实源。

### 2.2 上传状态机

**新增文件**

- `apps/apple/DocPilot/Core/Upload/UploadClient.swift`
- `apps/apple/DocPilot/Core/Upload/UploadState.swift`
- `apps/apple/DocPilot/Core/Upload/PDFValidator.swift`
- `apps/apple/DocPilot/Features/Documents/UploadModel.swift`
- `apps/apple/DocPilot/Features/Documents/UploadSheet.swift`
- 对应 validator、状态机和 transport 测试

**测试先行**

1. 钉住 PDF/MIME、空文件、50MB、SHA-256 和重复文档短路。
2. 钉住 create → PUT → complete 顺序、进度、取消、失败恢复及幂等确认。
3. 使用 security-scoped URL 读取用户选择文件，离开作用域前复制到应用临时目录。
4. macOS 使用 `fileImporter`，iOS/iPadOS 使用同一 SwiftUI API；上传完成后刷新服务端列表。

**验证**

```bash
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:DocPilotTests/Documents test
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:DocPilotTests/Upload test
pnpm --filter @doc-pilot/api test
```

## PR 3：PDFKit、缓存与本机高亮

### 3.1 下载缓存

**新增文件**

- `apps/apple/DocPilot/Core/Cache/DocumentCache.swift`
- `apps/apple/DocPilot/Core/Cache/CachedDocument.swift`
- `apps/apple/DocPilot/Core/Cache/CacheFileSystem.swift`
- 对应 fake filesystem 测试

**测试先行**

1. 钉住 `userId/documentId/version` 缓存键、临时下载、原子移动、校验失败和用户级清理。
2. 缓存元数据进 SwiftData；Bearer、预签名 URL 和 OTP 不落库。
3. 服务端版本变化或文件缺失时重新下载；离线且有有效缓存时允许阅读。

### 3.2 PDFKit 阅读器

**新增文件**

- `apps/apple/DocPilot/Features/Reader/PDFKitView.swift`
- `apps/apple/DocPilot/Features/Reader/ReaderModel.swift`
- `apps/apple/DocPilot/Features/Reader/ReaderView.swift`
- `apps/apple/DocPilot/Features/Reader/ReaderToolbar.swift`
- `apps/apple/DocPilot/Features/Reader/DocumentOutlineView.swift`

**步骤**

1. 用 `UIViewRepresentable` / `NSViewRepresentable` 包装同一 Reader coordinator。
2. 接入页码、前后翻页、适宽、缩放、目录、文内搜索与 `initialPage`。
3. 文档和下载任务由 model 持有；SwiftUI body 不直接发网络请求。
4. 验证 500 页占位、内存告警后的释放和窗口尺寸变化。

### 3.3 本机高亮

**新增文件**

- `apps/apple/DocPilot/Core/Highlights/Highlight.swift`
- `apps/apple/DocPilot/Core/Highlights/HighlightStore.swift`
- `apps/apple/DocPilot/Features/Reader/SelectionActions.swift`
- 对应坐标、跨页选择、增删与用户隔离测试

**步骤**

1. 将 PDFSelection bounds 转为页坐标并保存 `userId/documentId/page/bounds/text`。
2. 使用 PDFKit annotation/overlay 展示，但不写回原 PDF。
3. 支持复制、添加和删除；登出时按用户删除。

## PR 4：流式问答与引用核验

### 4.1 SSE 与 Chat DTO

**新增文件**

- `apps/apple/DocPilot/Core/Contracts/Chat.swift`
- `apps/apple/DocPilot/Core/Streaming/SSEParser.swift`
- `apps/apple/DocPilot/Core/Streaming/SSEClient.swift`
- `apps/apple/DocPilot/Features/Chat/ChatClient.swift`
- 对应 chat fixture、分帧和取消测试

**测试先行**

1. 钉住 CRLF/LF、跨 chunk 边界、多行 data、未知事件、非法 JSON 和流结束。
2. 钉住 JSON replay 与 SSE 两种 POST 响应。
3. 钉住 completed/failed/断线后重新拉取消息，以及 `clientRequestId` 幂等重试。

### 4.2 Chat UI、Markdown 与引用

**新增文件**

- `apps/apple/DocPilot/Features/Chat/ChatModel.swift`
- `apps/apple/DocPilot/Features/Chat/ChatView.swift`
- `apps/apple/DocPilot/Features/Chat/MessageViews.swift`
- `apps/apple/DocPilot/Features/Chat/MarkdownRenderer.swift`
- `apps/apple/DocPilot/Features/Chat/CitationView.swift`
- `apps/apple/DocPilot/App/ReaderChatSplitView.swift`

**步骤**

1. 实现历史分页、发送门禁、流式回答、重试、拒答和滚动到底部。
2. 原生渲染段落、列表、强调、行内代码和代码块；AI 文本不解析原始 HTML。
3. 引用必须来自服务端 DTO；点击后在大屏左侧 PDF 跳页，窄屏路由到 Reader。
4. iPad/Mac 使用可调 `HSplitView`/平台等价布局；紧凑宽度自动使用单页模式。

## PR 5：搜索、通知、账户与发布门禁

### 5.1 搜索、通知和账户

**新增文件**

- `apps/apple/DocPilot/Core/Contracts/{Search,Notifications}.swift`
- `apps/apple/DocPilot/Features/Search/**`
- `apps/apple/DocPilot/Features/Notifications/**`
- `apps/apple/DocPilot/Features/Account/**`

**步骤**

1. 全局搜索 debounce、取消旧请求，结果跳到文档页码。
2. 前台连接通知 SSE，重连先接 snapshot；进入后台立即取消，回前台重新补齐。
3. 实现资料、用量、工作区、会话和主题设置；注销账户继续显示禁用占位。

### 5.2 可访问性与 UI 测试

**新增/修改文件**

- `apps/apple/DocPilotUITests/**`
- `apps/apple/DocPilot/SharedUI/**`
- `e2e/fixtures/apple-sample.pdf`

**步骤**

1. 为主要控件添加稳定 accessibility identifier，建立可注入 stub server 的 UI Test 配置。
2. 覆盖 OTP、上传、处理完成、离线阅读、提问、引用跳页与登出。
3. 验证 VoiceOver label、最大 Dynamic Type、深浅主题、Reduce Motion、iPad 分屏和 Mac 窄窗口。

### 5.3 CI 与开发文档

**新增/修改文件**

- `.github/workflows/apple.yml`
- `scripts/apple/check-project.sh`
- `README.md`
- `CLAUDE.md`
- `docs/runbooks/deployment.md`

**步骤**

1. CI 安装固定版本 XcodeGen，检查工程生成无差异。
2. 并行运行 Swift unit tests、iOS Simulator build/test 与 macOS build/test。
3. Release 配置缺少 HTTPS API Base URL 时构建失败；Debug 文档说明本机网络和 Simulator 地址。
4. README 补充生成、打开、构建、测试和本地后端启动命令。

## 每个 PR 的统一门禁

```bash
git diff --check
pnpm lint
pnpm typecheck
pnpm test
xcodegen generate --spec apps/apple/project.yml
scripts/apple/check-project.sh
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
xcodebuild -project apps/apple/DocPilot.xcodeproj -scheme DocPilot \
  -destination 'platform=macOS' test
```

若本机不存在指定 Simulator，先通过 `xcrun simctl list devices available` 选择同代可用设备，CI
则固定 runner 上已安装的目标。不得通过跳过测试或放宽断言来迁就失败。

## 最终验收

1. 新用户在 iPhone、iPad、Mac 均能完成 OTP 登录。
2. 可上传 50MB 以内 PDF，观察处理状态并在完成后离线重开阅读。
3. PDFKit 支持目录、搜索、页码、选择、复制和本机高亮。
4. 问答以 SSE 流式展示，完成后与服务端消息一致；断线可恢复。
5. 引用在大屏并排阅读器或紧凑页面准确跳到对应页。
6. 搜索、通知、账户和登出功能可用，Token 不出现在非 Keychain 存储和日志中。
7. 租户隔离、幂等、三层文件限制、AI Gateway 和现有 Web 行为没有回归。

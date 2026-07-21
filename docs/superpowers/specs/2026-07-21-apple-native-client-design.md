# Apple 原生客户端设计

## 1. 目标与范围

在现有 Next.js Web 之外增加 Apple 原生客户端，共用 Hono API、Worker、PostgreSQL、Redis、
对象存储与 AI Gateway，不替换 Web，也不复制服务端业务逻辑。

第一版覆盖 iPhone、iPad 与 Mac，最低版本为 iOS/iPadOS 17、macOS 14。用户能够完成完整核心闭环：

1. 邮箱 OTP 登录。
2. 查看文档列表与处理状态。
3. 选择并直传 PDF。
4. 缓存并使用 PDFKit 阅读 PDF。
5. 基于文档进行 SSE 流式问答。
6. 查看引用并跳转到对应 PDF 页。
7. 搜索文档内容、查看通知和账户信息。
8. 选择、复制文本，并保存仅本机可见的高亮。

第一版不做 APNs、跨设备高亮同步、后台持续 SSE、编辑原 PDF、多窗口协作、Apple Watch 或
visionOS 客户端。

## 2. 技术选择

采用真正的原生客户端直连现有 API：SwiftUI 负责界面，PDFKit 负责 PDF，URLSession 负责
REST、SSE、下载和上传，CryptoKit 负责 SHA-256，Keychain 保存 Bearer Session，SwiftData
保存缓存索引和本机高亮。

不采用以下方案：

- **WebView 外壳**：交付更快，但离线 PDF、系统导航、可访问性和长期维护不符合原生目标。
- **Apple 专属 BFF**：会形成两套业务接口，增加租户授权和契约维护成本。

工程放在 `apps/apple/`，使用 XcodeGen。仓库提交 `project.yml` 与生成的 `.xcodeproj`，CI 检查
重新生成后无差异。应用使用一个 SwiftUI Multiplatform 工程，共享业务层和大部分界面；仅
PDFKit 包装、文件选择及少量平台命令使用条件编译。

## 3. 系统边界

```text
apps/apple/DocPilot
├── App                 平台入口、依赖注入、深链与场景
├── Core
│   ├── APIClient       JSON REST、Bearer、错误规范化
│   ├── AuthClient      OTP、Keychain Session、认证恢复
│   ├── SSEClient       问答和通知事件流
│   ├── UploadClient    校验、SHA-256、预签名 PUT
│   └── LocalStore      PDF 缓存索引与本机高亮
├── Features
│   ├── Authentication
│   ├── Documents
│   ├── Reader
│   ├── Chat
│   ├── Search
│   └── Account
└── SharedUI            墨水纸 token、加载/空/错误状态
```

后端只增加原生 Bearer Session 接线和客户端元数据，不改变 Web 的 Cookie Session，也不改变
API → Service → tenant-scoped Repository 链路。原生客户端不得提交或信任 `workspaceId`；租户
仍由服务端从已认证 membership 解析。

Swift DTO 与 TypeScript contracts 保持同一字段语义。第一版不引入自动代码生成，以稳定 JSON
和 SSE fixtures 同时验证两端契约；当 API 面扩大后再评估 OpenAPI 生成客户端。

## 4. 导航与界面

iPad 和 Mac 使用三栏工作台：功能栏、文档列表、内容区。iPhone 自动退化为 Tab 与
`NavigationStack`。功能栏提供文档、搜索、通知与设置；文档列表支持状态、选择与刷新。

在足够宽的 iPad/Mac 窗口中，PDF 与问答并排显示，分隔条可调宽。点击引用时 PDF 侧直接跳转
到对应页。窄窗口和 iPhone 使用独立阅读/问答页面，引用通过路由切换到阅读页并定位页码。

界面沿用 Web 的“墨水纸”语义，但使用系统颜色与语义 token，不逐像素复制 CSS。必须支持
深浅主题、Dynamic Type、VoiceOver、键盘导航和 Reduce Motion。

## 5. 状态与数据流

### 5.1 认证

邮箱提交到 OTP 发送端点，验证码验证成功后取得 Bearer Session Token，并只写入 Keychain。
应用启动时验证 session；401 会清除 Token 和当前用户的本地数据索引并返回登录页。客户端不对
写请求做隐式重放，避免重复上传或提问。

### 5.2 文档与上传

`DocumentsStore` 从服务端拉取列表，处理中文档定时刷新，服务端始终是状态事实源。

上传流程：

```text
fileImporter
→ 本地 PDF 类型/大小预校验
→ CryptoKit SHA-256
→ POST /documents
→ URLSessionUploadTask PUT 预签名 URL
→ POST /documents/:id/complete-upload
→ 刷新服务端文档状态
```

上传展示进度并允许取消。中断后先查询服务端状态，再决定完成确认或重新创建上传任务。客户端
校验只提供即时反馈；API 与 Worker 继续执行权威的三层限制校验。

### 5.3 PDF 缓存与高亮

文件下载到临时路径，验证后原子移动到按用户和文档隔离的缓存目录。缓存索引记录文档 ID、
版本、文件路径、大小与访问时间。校验失败时删除并重新下载。退出登录时删除该用户的缓存索引与
文件。

PDFKit 提供渲染、目录、搜索、缩放、文本选择和页码定位。高亮保存
`userId/documentId/page/bounds/text` 到 SwiftData，仅在本机有效，不修改对象存储中的原 PDF。

### 5.4 问答、通知与搜索

问答先确保一文档一会话，再通过 `URLSession.AsyncBytes` 消费 POST SSE。流式 delta 只用于即时
展示；completed、failed、replayed 或连接中断后均重新拉取消息，以服务端落库内容收敛。

通知只在前台保持 SSE。应用重新激活时依赖 snapshot/列表补齐，不承诺后台长连接。搜索调用
现有全局搜索 API，选择结果后进入对应文档与页码。

## 6. 状态所有权

应用级环境只持有认证会话、当前 workspace 展示信息、API 依赖和全局路由。各 Feature 使用
`@Observable` 模型拥有自己的加载、错误和操作状态，并通过构造器或 Environment 注入服务。
不创建聚合所有业务的巨型 AppModel。

## 7. 错误、安全与隐私

网络错误统一映射为离线、超时、服务器错误、限流、配额不足和认证过期。每个界面必须呈现可
理解的错误和安全的重试入口。SSE 断开、上传中断和缓存损坏都有明确恢复路径。

Bearer Token 不得进入 UserDefaults、SwiftData、日志、指标或 crash metadata。日志不记录完整
文档、完整问题、答案或 OTP。PDF 内容继续视为不可信数据，客户端不执行 PDF 内嵌脚本。

所有资源访问继续依赖服务端的 `workspace_id` 查询过滤、幂等键、配额和限流。原生客户端不得
绕过 AI Gateway、直接访问数据库或 AI Provider。

## 8. 测试与 CI

- **Swift Testing**：DTO 解码、错误映射、SSE 分帧、上传状态机、缓存键、高亮坐标和路由。
- **URLProtocol Stub**：Bearer 注入、OTP、401 清理、文档 API、预签名上传和消息恢复。
- **XCUITest**：OTP 登录、文档列表、选择 PDF、处理状态、阅读、提问、流式回答和引用跳页。
- **契约测试**：固定 JSON/SSE fixtures 同时校验 TypeScript 和 Swift DTO。
- **CI**：XcodeGen 生成一致性、iOS Simulator build/test、macOS build/test；现有门禁保持不变。

第一版验收覆盖 iPhone、iPad 分屏和 Mac 可调整窗口。核心流程必须通过 VoiceOver 标签、
Dynamic Type、深浅主题与 Reduce Motion 检查。

## 9. 分阶段交付

1. 工程骨架、共享 token、APIClient、Bearer Auth 与契约 fixtures。
2. 工作台导航、文档列表、上传和处理状态。
3. PDF 下载缓存、PDFKit 阅读器、搜索和本机高亮。
4. 会话历史、问答 SSE、Markdown、引用与大屏并排布局。
5. 通知、账户、全局搜索、可访问性与跨平台 E2E。

每一阶段都必须在 iOS Simulator 与 macOS 上可构建，并保持现有 Web/API/Worker 测试绿色。

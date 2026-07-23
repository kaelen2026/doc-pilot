# DocPilot Android 客户端设计

## 1. 背景与目标

DocPilot 已有 Web、API、Worker 与 iOS 原生客户端，但缺少 Android 客户端。本项目在
`apps/android` 新增 Kotlin + Jetpack Compose 应用，最低支持 Android 12（API 31），
application ID 为 `dev.w3ctech.docpilot`。

Android 首版对齐 iOS 当前能力：

- 邮箱 OTP、邮箱密码和 Google 登录；
- PDF 列表、上传、处理状态与失败重试；
- PDF 下载缓存、阅读、本地高亮与页码跳转；
- 基于文档的 SSE 流式问答和引用跳页；
- 全局搜索与搜索结果跳页；
- 通知列表、未读数、系统推送与通知深链；
- 扫码授权网页版登录；
- 账户用量、外观、退出登录和注销账户。

Apple 登录明确不在 Android 范围内。首版不包含 Play Store 上架操作、生产 Firebase
凭据或对 iOS 客户端的共享代码改造。

## 2. 技术决策

### 2.1 工程形态

Android 工程位于 `apps/android`，使用独立 Gradle Wrapper，不加入 pnpm workspace。
采用单 `app` module、按功能分包的分层架构。相比一开始拆成多个 Gradle feature module，
此方案减少首版配置成本，同时通过包、接口和依赖方向保留未来拆分边界。

不采用 Kotlin Multiplatform。现有 iOS 客户端已经稳定，以共享代码为目标会扩大范围并迫使
Swift 实现重构。

### 2.2 平台与主要依赖

- Kotlin 与 Jetpack Compose；
- Material 3，使用稳定 Compose BOM 管理兼容版本；
- Navigation Compose；
- Kotlin Coroutines 与 Flow；
- Retrofit、OkHttp、Kotlin Serialization；
- Room；
- Android Keystore；
- WorkManager；
- Android `PdfRenderer`；
- Google Identity Services；
- Firebase Cloud Messaging；
- CameraX 与 ML Kit Barcode Scanning。

`minSdk` 固定为 31。`compileSdk`、`targetSdk` 和依赖版本使用实施时官方稳定版本，不引入
alpha 或 beta 依赖。Java/Kotlin 工具链版本在 version catalog 中集中声明。

## 3. 应用架构

应用采用单 Activity + Compose：

```text
MainActivity
  └─ DocPilotApp / NavHost
      ├─ Auth
      │   ├─ 邮箱 OTP
      │   ├─ 邮箱密码
      │   └─ Google 登录
      └─ Workspace
          ├─ 文档
          │   ├─ 列表、上传、处理状态
          │   └─ 文档工作台
          │       ├─ PDF 阅读、缓存、高亮
          │       └─ SSE 问答、引用跳页
          └─ 账户
              ├─ 用量与外观
              ├─ 通知
              ├─ 扫码登录网页端
              └─ 退出与注销
```

包边界如下：

- `core/network`：统一 API client、Bearer 注入、错误映射和 SSE 解析；
- `core/database`：Room 数据库、缓存索引与本地高亮；
- `core/designsystem`：DocPilot 主题、颜色、排版、间距和通用组件；
- `core/security`：基于 Android Keystore 的会话存储；
- `data/*`：Repository 实现、API DTO 与本地数据源；
- `feature/*`：Compose Screen、ViewModel、UI state 与 Repository 接口；
- `navigation`：类型安全路由、登录态门禁与通知深链；
- `push`：FCM token 生命周期、通知渠道与消息处理。

依赖方向固定为 `Screen → ViewModel → Repository 接口 → Repository 实现 → API/Room`。
Composable 不直接调用网络或数据库，DTO 不进入 UI 层。

## 4. 关键数据流

### 4.1 登录与会话

OTP、密码和 Google ID Token 复用现有认证 API。登录响应的 `set-auth-token` 写入由
Android Keystore 保护的本地存储。启动时恢复会话；任一受保护请求收到 401 后清除本地
会话并回到登录页。退出登录先尽力注销推送 token，再调用服务端退出并清理本地数据。

### 4.2 文档上传与处理

用户选择 PDF 后，客户端先校验 MIME/扩展名、50MB 大小和 500 页上限，再创建上传任务。
WorkManager 使用预签名 URL 直传对象存储，随后调用幂等的完成接口。短暂网络错误采用有上限
的指数退避，业务校验或配额错误不自动重试。

Android 的校验只是第一层。API 创建上传任务与 Worker 解析仍执行第二、第三层限制校验。
请求处理仍通过 Transactional Outbox 交接异步任务，Android 不改变现有后端不变量。

文档列表只在存在处理中项目时轮询，并展示处理阶段、进度、失败原因和允许的重试动作。

### 4.3 阅读、缓存与高亮

PDF 下载到应用私有缓存目录，Room 保存 ETag、文件大小、最后访问时间和本地路径。缓存采用
LRU 清理，当前打开的文件不被回收。有效缓存存在时允许离线阅读。

`PdfRenderer` 按需渲染可见页及少量相邻页，避免一次性解码整份文档。阅读器支持缩放、页码
导航、搜索结果跳页和问答引用跳页。

高亮以 `userId + documentId + page + 坐标` 保存到 Room。所有查询必须同时限定用户与文档；
文档删除、账户注销或用户切换时清理对应记录和缓存文件。

### 4.4 问答与搜索

OkHttp 读取 SSE，解析 token、citation、done 和 error 事件，ViewModel 增量生成不可变 UI
state。页面离开或提交新问题时取消旧流。消息提交沿用现有幂等契约。

客户端只展示服务端返回且已通过业务校验的引用，不自行制造引用。点击引用打开对应文档页。
离线时保留已有阅读内容，但问答与搜索明确显示需要联网。

### 4.5 通知与扫码

Android 13 及以上在用户理解用途的场景申请通知权限。登录后注册 FCM token，token 刷新时
重新注册，退出时尽力注销。前台消息由应用展示，后台通知由系统托盘处理；点击 payload 后
深链至文档或通知列表。应用回到前台时重新同步真实未读数。

扫码使用 CameraX + ML Kit Barcode，只接受 DocPilot 定义的登录二维码格式。客户端展示目标
和确认动作，用户确认后调用现有扫码授权 API，不执行二维码携带的任意 URL。

## 5. 服务端 FCM 扩展

现有推送链路只支持 APNs，需同步扩展：

- 推送平台契约增加 `android`；
- 注册校验按平台处理 token：APNs 保持十六进制约束，FCM token 采用长度和字符集约束；
- 设备表继续以用户身份键控，平台字段区分 `ios/android`；
- 投递层按平台路由到 APNs 或 FCM HTTP v1；
- FCM 明确报告 token 失效时删除该 token；
- APNs 既有路径和测试不得回归。

Firebase 服务账号配置只允许由 API/Worker 对应的集中 `env.ts` 读取，业务代码不得直接读取
`process.env`。凭据不提交仓库。缺少 FCM 配置时 Android 推送明确降级并记录可观察错误，
但不得阻止 API/Worker 启动，也不得影响 iOS APNs 投递。

推送事件的产生仍遵守 Transactional Outbox：请求处理不得直接调用 APNs、FCM、BullMQ 或
Redis。

## 6. UI 与可访问性

界面保留 DocPilot 的暖纸色背景、深墨正文和朱砂强调色，但控件与交互遵循 Material 3，
不复刻 iOS Liquid Glass。

- 手机使用“文档 / 账户”底部导航；
- 宽屏使用 NavigationRail，但首版验收以竖屏手机为主；
- 上传入口位于文档页 Top App Bar；
- 文档工作台以阅读内容为主，问答使用可展开底部面板；
- 加载、空、错误、离线和处理失败均有独立状态；
- 支持浅色、深色和跟随系统；
- 支持 TalkBack、动态字体、键盘焦点和语义化描述；
- 触控目标不小于 48dp，文本与关键图标满足对比度要求。

## 7. 错误处理与安全

统一错误模型覆盖未认证、权限或资源不存在、输入校验失败、配额不足、限流、网络中断和服务端
故障。UI 根据场景提供重试、重新登录或返回操作，不显示底层堆栈、原始响应或凭据信息。

网络层只连接构建配置提供的 API base URL。Release 默认要求 HTTPS；Debug 可显式配置本地
开发地址。环境配置集中于 Android `BuildConfig`/资源接线层，业务代码不散落读取。

日志不得包含 Bearer token、OTP、Google ID Token、FCM token、PDF 内容或用户问题全文。
本地业务数据只写入应用私有目录，账户注销完成后清除会话、Room 数据与缓存文件。

## 8. 测试策略

### 8.1 Android 测试

- JVM 单元测试：DTO/契约、SSE parser、上传状态机、PDF 校验、高亮坐标、错误映射和
  ViewModel；
- MockWebServer：Bearer、认证响应头、幂等键、SSE 分片和 API 错误；
- Room 测试：用户/文档隔离、级联清理和缓存索引；
- Compose UI 测试：登录、文档列表、账户、问答及加载/空/错误状态；
- Instrumentation：PDF 渲染、文件选择、Room、加密会话与通知深链；
- 端到端冒烟：复用本地 Mailpit OTP，验证登录、上传、处理、阅读、提问和引用跳页。

### 8.2 服务端测试

- Android/FCM token 正反例；
- 同一 token 重复注册的幂等性；
- APNs 与 FCM 平台路由；
- FCM 失效 token 清理；
- 缺少 FCM 配置的明确降级；
- 既有 APNs 注册、投递和清理行为不回归。

## 9. 构建门禁与验收

Android 本地门禁：

```bash
./gradlew lint testDebugUnitTest assembleDebug
./gradlew connectedDebugAndroidTest
```

服务端改动继续通过根仓库：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

最低系统验收使用 Android 12（API 31）模拟器，并增加当前稳定 Android 版本模拟器。没有
Firebase 凭据时，构建和非推送测试仍必须通过；真实 FCM 冒烟由显式环境开关启用。

完成标准：

1. Android Studio 可直接导入 `apps/android` 并构建 Debug APK；
2. 除 Apple 登录外，本文第 1 节列出的 iOS 能力均可在 Android 完成；
3. Android 12 上核心闭环端到端通过；
4. 引用跳页、离线阅读、高亮隔离和上传幂等性具有自动化测试；
5. FCM 与 APNs 能按平台投递，APNs 无回归；
6. 仓库 README 和 Android README 记录本地配置、构建、测试与真实推送步骤；
7. 不提交生产密钥、服务账号文件或用户数据。


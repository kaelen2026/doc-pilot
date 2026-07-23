# DocPilot Android 客户端实施计划

## 阶段 1：推送契约与服务端

1. 先扩展 `push.schema.test.ts`，钉住 iOS hex token 与 Android FCM token 的不同校验。
2. 在 `@doc-pilot/contracts` 增加 Android 平台和 FCM token 边界。
3. 调整 API 注册解析，保持 iOS 规范化行为并接受 FCM token。
4. 为平台分发写纯函数/DI 测试，再实现 APNs/FCM 路由与失效 token 汇总。
5. 在 API、Worker 的唯一 `env.ts` 增加 FCM 配置解析；缺配置时 best-effort 降级。
6. 更新 `.env.example` 和后端测试。

## 阶段 2：Android 工程骨架

1. 创建 `apps/android` Gradle 工程、Wrapper、version catalog、Manifest 与构建配置。
2. 建立 Material 3 墨水纸主题、单 Activity、导航和应用容器。
3. 建立 API client、统一错误、加密会话存储与 Repository 边界。
4. 为 SSE parser、PDF 校验、高亮隔离等纯逻辑先写 JVM 测试。

## 阶段 3：核心产品闭环

1. 认证：OTP、密码、Google ID token、会话恢复与退出。
2. 文档：列表、刷新、文件选择、三层限制的客户端预校验、预签名上传与完成回调。
3. 阅读：私有缓存、`PdfRenderer` 按页渲染、页码导航、本地高亮。
4. 问答：会话、历史消息、SSE 增量回答、引用展示与跳页。
5. 搜索：远程搜索、文档/页码结果和跳转。

## 阶段 4：平台能力与账户

1. 通知：列表、未读数、标记已读、FCM token 注册与深链。
2. 扫码：CameraX + ML Kit，只解析并确认 DocPilot 登录码。
3. 账户：用量、主题、退出、二次确认注销和本地清理。
4. 补齐加载、空、失败、离线状态与 TalkBack 语义。

## 阶段 5：验证与文档

1. 运行 Android JVM 测试、lint、Debug 构建。
2. 有可用模拟器时运行 instrumentation/Compose UI 测试。
3. 运行受影响的 pnpm typecheck、Biome 与 Vitest。
4. 更新根 README、Android README、配置模板与 CI/本地命令。
5. 检查密钥、token、用户数据和构建产物未进入版本控制。


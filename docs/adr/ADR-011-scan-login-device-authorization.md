# ADR-011：扫码登录采用 OAuth 2.0 设备授权流程(RFC 8628)

**状态**:Accepted

## 背景

需要「iOS 扫码登录 web」能力:web(未登录)展示二维码,已登录的 iOS app 扫码并确认后,web 端完成登录(类微信网页版扫码登录)。

三种落地方式:

1. **自建 broker + 手写状态机**:新建登录请求模块(pending→scanned→approved),自己生成/校验 token,并为 web **手写创建 Better Auth 会话**。工作量大,且手写 session 绕过了 Better Auth 的会话签发,风险高。
2. **复用 Better Auth `oneTimeToken` 插件**:已登录设备生成一次性 token,另一设备 verify 换会话。但其 verify 语义是把验证方 cookie 设为**生成方(手机)那条 session 的 token**(`setSessionCookie(c, phoneSession)`),即 **web 与手机共享同一条 session**——手机登出会连带 web 掉线,设备管理列表(`sessions-section`)只显示手机、看不到 web 浏览器。语义不符。
3. **复用 Better Auth `deviceAuthorization` 插件(RFC 8628)**:标准「输入受限设备发起、另一已登录设备批准」协议。

## 决策

采用方式 3:启用 Better Auth 的 `deviceAuthorization` 插件,端点经 `auth.handler` 自动挂在 `/api/auth/device/*`。

- `POST /device/code`:web 取 `user_code` + `device_code` + `verification_uri_complete`(编入二维码),按返回的 `interval` 轮询。
- `POST /device/token`:web 轮询;未批准返回 `authorization_pending`,批准后插件内部 **`createSession(user.id)` 为 web 新建一条独立会话** 并设 cookie。
- `POST /device/approve` · `/device/deny`:iOS 已登录态(bearer)批准/拒绝某 `user_code`。

关键取舍:

- **web 得到独立会话**(方式 3 相较方式 2 的决定性优势):可独立吊销,设备管理列表正确显示 web 浏览器。
- **二维码承载 `docpilot://device-login?user_code=…`**:设 `verificationUri` 为该 scheme(已在 `trustedOrigins`),iOS 扫码即可解析 `user_code`。
- **短生命周期**:`expiresIn: "2m"`(默认 30m 对扫码场景过长,缩短泄露窗口);`interval: "2s"`。
- **首方校验**:`validateClient` 只放行 web 客户端 `docpilot-web`,拒绝任意 `client_id` 发起设备流。
- **取码限流**:`/device/code` 未认证,按来源 IP 限流(10 次/分钟),防刷爆 `device_code` 表。
- 三端共用常量(scheme / client_id / grant_type / 轮询错误码)集中于 `@doc-pilot/contracts` 的 `scan-login.ts`,避免漂移。

## 后果

- 后端几乎零自研:启用插件 + 建 `device_code` 表 + 接线,协议正确性由 Better Auth 保证。
- 轮询是 RFC 8628 原生语义(`authorization_pending` / `slow_down`),web 端无需长连接。
- `device_code` 表短生命周期,不承载持久业务事实;过期由插件按 `expiresAt` 处理。
- 完整 approve→session 快乐路径需已登录会话,由 iOS 端 E2E / 手动 QA 覆盖;集成测覆盖取码、首方校验、`authorization_pending`。

## 参见

- [数据模型 · §8.1.1 认证表](../architecture/data-model.md)
- `packages/contracts/src/scan-login.ts`、`packages/auth/src/auth-plugins.ts`
- [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)

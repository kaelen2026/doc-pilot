# ADR-012：原生 Sign in with Apple 采用 idToken 直登(复用 Bearer/Keychain)

**状态**:Accepted

## 背景

iOS app 需要「通过 Apple 登录」。此前 app 仅有邮箱验证码(emailOTP)登录与「iOS 扫码登录 web」(ADR-011)。Better Auth 已内置 Apple provider(含 `verifyIdToken`)与原生 idToken 端点,iOS 也已在 OTP 登录中用 Bearer token(`set-auth-token` → Keychain,见 `cross-cutting.md#26.0`)。

两种落地方式:

1. **Web OAuth 重定向流**:iOS 用 `ASWebAuthenticationSession` 打开 `/api/auth/sign-in/social`,走 Apple 授权页 + 回调 + code 交换。需处理回跳 scheme、web 视图内的 cookie/session,且对原生 app 而言体验割裂(跳浏览器)、还要为原生端维护一套 web 回调。
2. **原生 idToken 直登**:iOS 用 `ASAuthorizationController` 原生弹窗拿到 Apple `identityToken`,POST 给 Better Auth 的 `POST /api/auth/sign-in/social`(`{ provider: "apple", idToken: { token, nonce } }`),服务端用 Apple 公钥 `verifyIdToken` 验签后签发会话。无 web 视图、无回跳。

## 决策

采用方式 2:**原生 idToken 直登,并完全复用既有 Bearer/Keychain 机制**,不为 Apple 登录新建任何 API 或会话通路。完整链路:

- **iOS**:`SignInWithAppleButton` → `ASAuthorizationController` 拿 `identityToken` → `AuthClient.signInWithApple(identityToken:nonce:)` POST `/api/auth/sign-in/social`。收尾与 `verifyOTP` **完全一致**:从响应头 `set-auth-token` 取签名 Bearer 存 Keychain,再 `restoreSession()` 拉 `AuthSession`。
- **后端 provider 注册**:`resolveSocialProviders(env)` 里 apple 分支**凭据齐备才注册**(照 Google 的 env-gated 范式,缺失即跳过,不装配必然报错的 provider)。client secret 不静态配置,而是用 `jose` 从 `teamId/keyId/privateKey` **动态签发 ES256 JWT**(Apple 上限 6 个月,动态生成免手动轮换)。
- **`appBundleIdentifier` 校验原生 aud**:原生 idToken 的 `aud` 是 App bundle id 而非 Service ID,故 provider 配 `appBundleIdentifier`,否则触发 JWT claim 校验失败(即「原生用 App ID 当 client id」的官方约定)。
- **nonce 防重放**:iOS 生成随机 raw nonce,下发 `sha256Hex(rawNonce)` 给 Apple(其原样写入 idToken 的 `nonce` claim),登录请求 body 回传 **raw** nonce,后端 `nonceMatches` 以 `jwtNonce === sha256Hex(rawNonce)` 命中。该 sha256 约定对着 Better Auth apple provider 源码核实,非猜测。

> ⚠️ 两处配置面易踩(真机才暴露,勿再踩):
> 1. **entitlements 单一来源(见 ADR 后果 / #120)**:`com.apple.developer.applesignin` 与 APNS 的 `aps-environment` 都必须走 **per-config xcconfig**(`CODE_SIGN_ENTITLEMENTS` → `DocPilot.Debug/Release.entitlements`)。用 `project.yml` 的 `entitlements:` 块会被 xcodegen 写进 pbxproj 显式设置,**优先级高于 xcconfig**,静默盖掉另一套(曾致 APNS entitlement 缺失)。
> 2. **App ID 须在 Apple 后台开启 Sign in with Apple capability**,否则自动签名签不出含该 entitlement 的描述文件(`-allowProvisioningUpdates` 也无能为力)。

关键取舍:

- **零新增通路**:Apple 登录复用 OTP 已建立的 `set-auth-token` → Keychain → Bearer 收尾,不新增 API、不新增会话类型,契合「Bearer 只改变凭据承载方式」(`cross-cutting.md#26.0`)。
- **凭据 env-gated**:`APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY(/APP_BUNDLE_IDENTIFIER)` 集中于 `packages/auth/src/env.ts`,缺失则不注册 provider——本地/CI 无凭据也能跑,登录页据此决定是否展示按钮。私钥(.p8)只入本地 `.env`,不进库。
- **`DEVELOPMENT_TEAM` 在 repo 留空**:受限 entitlement(SIWA / APNS)真机联调由开发者本地覆盖团队;模拟器构建不校验受限 entitlement,故 CI 仍绿。
- **`https://appleid.apple.com` 纳入 `trustedOrigins`**:供 Better Auth 与 Apple 认证服务器通信。

## 后果

- 后端仅在 `social.ts`/`env.ts` 接线,复用 Better Auth 内置 apple provider 的 `verifyIdToken`(Apple 公钥验签);显式给 `@doc-pilot/auth` 加 `jose` 依赖(原为 better-auth 的 peer)。
- iOS 新增 `AppleSignIn`(nonce 纯函数,可单测)+ `AuthClient.signInWithApple` + 登录页按钮;`AuthClientTests` 覆盖「取 `set-auth-token` 存会话」与「缺头 → invalidResponse」。
- entitlements 统一到 per-config xcconfig 单一来源(#120):`DocPilot.Debug/Release.entitlements` 各含 `applesignin` + 对应 `aps-environment`,去掉 `project.yml` 的 `entitlements:` 块;`-showBuildSettings` 实测双配置各归其位。
- 凭据获取与 Apple 后台配置见运维手册;真机/TestFlight 需本地设 `DEVELOPMENT_TEAM`。

## 参见

- [Apple 登录凭据获取与配置运维手册](../runbooks/apple-signin-credentials.md)
- [横切关注点 · §26.0 客户端会话接线](../architecture/cross-cutting.md)
- `packages/auth/src/{social,env}.ts`、`apps/ios/DocPilot/{Core/Auth/AppleSignIn,Core/Auth/AuthClient,Features/Authentication/LoginModel}.swift`
- `apps/ios/Config/{Debug,Release}.xcconfig`、`Config/DocPilot.Debug.entitlements`、`Config/DocPilot.Release.entitlements`
- [Better Auth · Sign in with Apple](https://www.better-auth.com/docs/authentication/apple)、[ADR-011 扫码登录](ADR-011-scan-login-device-authorization.md)

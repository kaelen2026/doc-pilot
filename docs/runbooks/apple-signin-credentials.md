# 运维手册:获取并配置 Apple 登录凭据

对应设计 [Apple 原生客户端设计](../superpowers/specs/2026-07-21-apple-native-client-design.md) 与
[ADR-011 扫码登录](../adr/ADR-011-scan-login-device-authorization.md)。本手册手把手带你在 Apple
Developer 后台申请「Sign in with Apple」所需的四样真实凭据,并说明它们分别喂给谁。

- **iOS 签名**用 `DEVELOPMENT_TEAM`(= Team ID),落点 `apps/ios/project.yml`。
- **服务端** better-auth 的 Apple provider 需要一段 **client secret(JWT)**,由 `Team ID + Key ID + .p8`
  三者签出;`clientId` 用 Bundle ID(原生)或 Service ID(web)。落点 `packages/auth/src/env.ts` →
  `resolveSocialProviders`(现仅接了 Google,需照其写法补 Apple 分支)。

> 本地跑模拟器、跑 CI 门禁**不需要**这些;只有真机调试 + Sign in with Apple 真流程才需要。

## 现状与目标标识

| 项 | 当前值 | 说明 |
|---|---|---|
| Bundle ID | `dev.w3ctech.docpilot` | `apps/ios/project.yml`(`bundleIdPrefix: dev.w3ctech`) |
| `DEVELOPMENT_TEAM` | 空 | `project.yml` / `pbxproj` 均留空,本地自动签名 |
| server Apple provider | 未接线 | `social.ts` 目前只处理 Google |
| iOS 登录代码 | 未实现 | Swift 侧尚无 `ASAuthorization` |

## 前提:付费 Apple Developer Program 会员

Sign in with Apple **不能用免费个人账号**,必须加入 Apple Developer Program(99 美元/年)。
到 <https://developer.apple.com/account> 若顶部提示 **Enroll**,先完成注册(个人需证件核验,机构需
D-U-N-S,可能等 1–2 天)。

## 四样凭据总览

| 凭据 | 形如 | 用在哪 |
|---|---|---|
| **Team ID** | `A1BCD23EFG`(10 位) | iOS `DEVELOPMENT_TEAM` + client secret JWT 的 `iss` |
| **Key ID** | `2ABCD3EFGH`(10 位) | client secret JWT 头的 `kid` |
| **`.p8` 私钥** | `AuthKey_2ABCD3EFGH.p8` | 签 client secret JWT 的私钥(**只能下载一次**) |
| **clientId** | Bundle ID 或 Service ID | server Apple provider 的 `clientId` |

## ① Team ID(= `DEVELOPMENT_TEAM`)

1. 打开 <https://developer.apple.com/account>。
2. 左侧栏 **Membership details**(会员详情)。
3. **Team ID** 即 10 位大写字母数字,形如 `A1BCD23EFG`。

> 也能在 Xcode → Settings → Accounts → 选中 Apple ID 处核对。此值同时是 iOS 签名的
> `DEVELOPMENT_TEAM`,也是 client secret JWT 的 `iss`。

## ② 注册 App ID 并打开 Sign In with Apple 能力

1. **Certificates, Identifiers & Profiles** → **Identifiers** → **➕**。
2. **App IDs** → Continue → 类型 **App** → Continue。
3. **Description** 填 `DocPilot iOS`。
4. **Bundle ID** 选 **Explicit**,填仓库已有的 `dev.w3ctech.docpilot`。
5. **Capabilities** 勾上 **Sign In with Apple**。
6. Continue → Register。

## ③(仅 Web 浏览器登录才需要)创建 Service ID

- **只做 iOS 原生登录**(`ASAuthorizationAppleIDButton`,走 id_token)→ **跳过**,server 的
  `clientId` 直接用 Bundle ID `dev.w3ctech.docpilot`。
- **web 上也要「用 Apple 登录」**(浏览器跳转授权页)→ 必须建 Service ID,它才是 web 流程的 `clientId`。

1. Identifiers → ➕ → **Services IDs** → Continue。
2. Description `DocPilot Web`,**Identifier** 填反向域名(建议 `dev.w3ctech.docpilot.web`,不能与
   Bundle ID 相同)→ Register。
3. 点进该 Service ID → 勾 **Sign In with Apple** → **Configure**:
   - **Primary App ID** 选 ②的 `dev.w3ctech.docpilot`。
   - **Domains** 填后端域名(如 `api.docpilot.<你的域名>`)。
   - **Return URLs** 填 better-auth 的 Apple 回调:`${BETTER_AUTH_URL}/api/auth/callback/apple`。
   - Save → Continue → Save。

> Apple **不接受 `localhost` / 裸 IP** 作为 Return URL。本地调试用线上域名,或用 ngrok /
> cloudflared 暴露一个 https 公网域名。

## ④ 创建 Sign in with Apple Key,拿到 Key ID 与 .p8

1. 左侧 **Keys** → **➕**。
2. **Key Name** 填 `DocPilot SIWA`。
3. 勾 **Sign in with Apple** → **Configure** → **Primary App ID** 选 `dev.w3ctech.docpilot` → Save。
4. Continue → **Register**。
5. 下载页:
   - 记下页面显示的 **Key ID**(10 位,形如 `2ABCD3EFGH`)。
   - 点 **Download** 下载 `AuthKey_2ABCD3EFGH.p8`。

> ⚠️ **`.p8` 只能下载一次**,关掉页面即再也下不了(只能作废重建)。下载后妥善保存,**绝不进 git**。

## ⑤ 把 Team ID 填进 iOS 签名

改 `apps/ios/project.yml`(xcodegen 的源,`pbxproj` 由它生成):

```yaml
# apps/ios/project.yml
settings:
  DEVELOPMENT_TEAM: "A1BCD23EFG"   # 换成你的 Team ID
```

然后 `cd apps/ios && xcodegen generate` 重新生成工程。不想把 Team ID 写进仓库,可留空并在 Xcode
**Signing & Capabilities** 勾 *Automatically manage signing* + 选 Team,由本地注入;CI 侧走 xcconfig
本地覆盖,不提交明文。

## ⑥ 用 Team ID + Key ID + .p8 生成 client secret(JWT)

better-auth 的 Apple provider `clientSecret` 是一段 **ES256 签名 JWT**,Apple 规定**最长约 6 个月**过期,
到期需重签。用下面脚本生成(`jose` 仓库已有;缺就 `pnpm add -w jose`):

```js
// gen-apple-secret.mjs  —  node gen-apple-secret.mjs
import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

const TEAM_ID = "A1BCD23EFG"; // ① Team ID
const KEY_ID = "2ABCD3EFGH"; // ④ Key ID
const CLIENT_ID = "dev.w3ctech.docpilot"; // 原生用 Bundle ID;web 流程用 Service ID
const P8_PATH = "./AuthKey_2ABCD3EFGH.p8"; // ④ 下载的私钥

const key = await importPKCS8(readFileSync(P8_PATH, "utf8"), "ES256");
const now = Math.floor(Date.now() / 1000);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: KEY_ID })
  .setIssuer(TEAM_ID)
  .setIssuedAt(now)
  .setExpirationTime(now + 60 * 60 * 24 * 180) // 180 天,Apple 上限约 6 个月
  .setAudience("https://appleid.apple.com")
  .setSubject(CLIENT_ID)
  .sign(key);
console.log(jwt);
```

产出的 JWT 即 `APPLE_CLIENT_SECRET`。**脚本与 .p8 放临时目录跑,别进仓库。**

## ⑦ 配置到环境变量(接线待补)

按 env.ts 集中读取的铁律,凭据进 `packages/auth/src/env.ts`,再由 `social.ts` 派生 provider
(现仅处理 Google,需照其写法补 Apple 分支)。`.env` 追加(对齐 Google 的注释风格):

```env
# Apple 社交登录(可选)。三者齐备才注册 Apple provider。
# 回调地址在 Apple 后台 Service ID 配为 ${BETTER_AUTH_URL}/api/auth/callback/apple。
APPLE_CLIENT_ID=dev.w3ctech.docpilot          # 原生用 Bundle ID;web 流程用 Service ID
APPLE_CLIENT_SECRET=<⑥生成的 JWT>              # [secret] 约 6 个月过期,到期重签
APPLE_APP_BUNDLE_IDENTIFIER=dev.w3ctech.docpilot  # 校验原生 id_token 的 aud
```

> **服务端 `resolveSocialProviders` 与 iOS Swift 侧的 `ASAuthorization` 登录代码都尚未实现**,
> 需另行开发。本手册只覆盖「拿到并配置凭据」这一段。

# 运维手册:获取并配置 Apple 登录凭据

对应决策 [ADR-012 原生 Sign in with Apple](../adr/ADR-012-apple-native-signin.md)(设计取舍与代码落点)。
本手册手把手带你在 Apple Developer 后台申请「Sign in with Apple」所需的真实凭据,并说明它们分别喂给谁。

- **iOS 签名**用 `DEVELOPMENT_TEAM`(= Team ID)。约定:repo 里**留空**,真机联调时本地覆盖(见 ⑤)。
- **服务端** better-auth 的 Apple provider 需要一段 **client secret(ES256 JWT)**——但**不用你手动生成**:
  `social.ts` 的 `resolveSocialProviders` 已接 Apple 分支,用 `jose` 从 `Team ID + Key ID + .p8`
  **运行时动态签发**(免手动轮换)。你只需把这三样 + `clientId`(原生用 Bundle ID)喂进
  `packages/auth/src/env.ts` 读的环境变量(见 ⑦)。

> 本地跑模拟器、跑 CI 门禁**不需要**这些;只有真机调试 + Sign in with Apple 真流程才需要。

## 现状与目标标识

| 项 | 当前值 | 说明 |
|---|---|---|
| Bundle ID | `dev.w3ctech.docpilot` | `apps/ios/project.yml`(`bundleIdPrefix: dev.w3ctech`) |
| `DEVELOPMENT_TEAM` | 空(刻意) | `project.yml` / `pbxproj` 均留空,真机联调本地覆盖(见 ⑤) |
| server Apple provider | 已接线 | `social.ts` 凭据齐备即注册,`jose` 动态签发 client secret(ADR-012) |
| iOS 登录代码 | 已实现 | `AppleSignIn` + `AuthClient.signInWithApple` + 登录页按钮 |
| App ID「Sign in with Apple」能力 | 需你在后台开启 | 见 ②;不开则自动签名签不出含该 entitlement 的描述文件 |

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

## ⑤ 提供 Team ID 给 iOS 签名(约定:本地覆盖,不写进仓库)

`DEVELOPMENT_TEAM` 在 repo 里**刻意留空**:受限 entitlement(Sign in with Apple / APNS)真机联调才需要
团队,模拟器构建与 CI 不校验,留空可让门禁保持绿(见 ADR-012)。真机构建时**本地覆盖**,二选一:

- **命令行**:`xcodebuild ... DEVELOPMENT_TEAM=A1BCD23EFG -allowProvisioningUpdates`(换成你的 Team ID)。
- **Xcode**:打开 `apps/ios/DocPilot.xcodeproj` → 选 target → **Signing & Capabilities** → 勾
  *Automatically manage signing* + 选 Team,并确保 Xcode **Settings → Accounts** 已登录该团队的 Apple ID,
  然后选真机 ⌘R。

> ⚠️ 前置:必须先在 Apple 后台给 App ID 开启 Sign in with Apple 能力(②),否则自动签名签不出含
> `com.apple.developer.applesignin` 的描述文件。**不要**为图省事把 Team ID 提交进 `project.yml`/`pbxproj`。

## ⑥ 配置环境变量(client secret 由服务端动态签发,无需手填)

**不用手动生成 client secret JWT。** `social.ts` 的 `resolveSocialProviders` 已用 `jose` 从
`APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY` **运行时动态签发** ES256 client secret(iss=Team ID、
sub=clientId、aud=`https://appleid.apple.com`、180 天),因此**没有 `APPLE_CLIENT_SECRET` 这个变量**,
也免去到期手动重签。你只需把凭据喂进 `packages/auth/src/env.ts` 读取的环境变量。

按 env.ts 集中读取的铁律,`.env` 追加(与 `.env.example` 保持一致;四项 CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY
齐备才注册 provider,缺一即跳过):

```env
# Sign in with Apple(可选)。client secret 由后端用私钥动态签发,不用自己配。
APPLE_CLIENT_ID=dev.w3ctech.docpilot            # 原生用 Bundle ID;web OAuth 流程用 Service ID
APPLE_TEAM_ID=A1BCD23EFG                         # ① Team ID
APPLE_KEY_ID=2ABCD3EFGH                          # ④ Key ID
APPLE_APP_BUNDLE_IDENTIFIER=dev.w3ctech.docpilot # 校验原生 idToken 的 aud(= App bundle id)
# ④ 的 .p8 内容;单行存储时把换行转义为字面量 \n(env.ts 会还原)。[secret] 勿提交。
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

> `.p8` 转单行:`awk 'BEGIN{ORS="\\n"}{print}' AuthKey_XXXX.p8`,把输出填进 `APPLE_PRIVATE_KEY` 的引号内。

## ⑦ 验证(可选)

配好后,不必等真机点按钮就能确认接线:

- **私钥能签**:`cd packages/auth && node --env-file=../../.env --input-type=module -e 'import {importPKCS8} from "jose"; await importPKCS8((process.env.APPLE_PRIVATE_KEY??"").replace(/\\n/g,"\n"),"ES256"); console.log("ok")'` 打印 `ok` 即 `.p8` 格式正确。
- **provider 已注册**:起 api 后 `curl -X POST $BETTER_AUTH_URL/api/auth/sign-in/social -H 'Content-Type: application/json' -d '{"provider":"apple","idToken":{"token":"bogus"}}'` 返回 `401 INVALID_TOKEN`(而非 `PROVIDER_NOT_FOUND`)即说明 apple provider 已上线。

配置面到此为止;代码侧的取舍与落点见 [ADR-012](../adr/ADR-012-apple-native-signin.md)。

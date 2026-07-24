# 运维手册:移动端发版自动化

DocPilot 三端(iOS + Android)发版全部由 GitHub Actions 驱动,**tag 触发、平台/商店解耦**——某商店审核慢不拖累其它。所有 workflow 都**包裹仓库已有的本地发版脚本**(不引 fastlane),凭据一律经仓库 Secret/Variable 注入,仓库里不留任何机密。

国内安卓商店走**各厂商官方 API 自建**(不用第三方 CLI/SaaS),商业使用无许可证顾虑;签名核心在 `apps/android/scripts/lib/sign.mjs`,有 `node:test` 单测。

## workflow 一览

| 平台 / 商店 | workflow | 触发 tag | Runner |
|---|---|---|---|
| iOS TestFlight | `.github/workflows/ios-release.yml` | `ios-v*` | macos-26 |
| Google Play(内测轨道) | `.github/workflows/android-release.yml` | `android-v*` | ubuntu |
| 国内五商店(华为 / vivo / 应用宝 / OPPO / 小米) | `.github/workflows/android-china-release.yml` | `android-cn-v*` | ubuntu |

三个 workflow 都支持 `workflow_dispatch` 手动触发(带版本 / 更新说明等输入)。国内 workflow 结构为 **build 一次签名 APK → 五家并行 fan-out**,任一家失败不影响其它。

## 一、发版前置(不可自动化,须先办妥)

- **iOS**:App Store Connect 里 App 记录已建;中国区需 **ICP 备案**已过。
- **Google Play**:该 App 已在 Play Console **人工完成过首个版本**(Play API 不接受从未有过版本的全新 App)。
- **应用宝**:该 App 已在腾讯开放平台**人工上架**过(应用宝 API 只更新已上架应用,不支持新应用发布)。
- **国内安卓通用**:软著、App ICP 备案、各商店开发者账号实名与「API 传包/发布」权限申请均已完成。

## 二、Secret / Variable 配置清单

在 **仓库 → Settings → Secrets and variables → Actions** 配置。缺失时对应 workflow 由 tag/手动触发会失败,但**不影响主 CI**。

### 共用(iOS / Android 通吃)

| 类型 | 名称 | 来源 / 说明 |
|---|---|---|
| Variable | `IOS_PROD_API_BASE_URL` | iOS 生产 HTTPS 后端地址(CI 就地注入 `Release.xcconfig`,不提交) |
| Variable | `ANDROID_PROD_API_BASE_URL` | Android 生产 HTTPS 后端地址 |
| Variable | `ANDROID_GOOGLE_CLIENT_ID` | Web OAuth Client ID(非机密) |

### iOS(`ios-release.yml`)

| 名称 | 来源 |
|---|---|
| `APPLE_TEAM_ID` | 10 位 Team ID |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` | App Store Connect → 集成 → App Store Connect API |
| `ASC_API_KEY_P8` | AuthKey_*.p8 的 **base64** |
| `IOS_DIST_CERT_P12` | 分发证书 .p12 的 **base64**(私钥无法在 CI 重建,故导入一次性 keychain) |
| `IOS_DIST_CERT_PASSWORD` | 上述 .p12 的口令 |

### Android 签名 + Google Play(`android-release.yml`、国内 workflow 复用签名)

| 名称 | 来源 |
|---|---|
| `DOC_PILOT_UPLOAD_KEYSTORE_BASE64` | 上传密钥库 .jks 的 **base64** |
| `DOC_PILOT_UPLOAD_STORE_PASSWORD` / `DOC_PILOT_UPLOAD_KEY_ALIAS` / `DOC_PILOT_UPLOAD_KEY_PASSWORD` | 密钥库 / key 口令与别名 |
| `PLAY_SERVICE_ACCOUNT_JSON` | Play Console 服务账号 JSON 原文 |

### 国内五商店(`android-china-release.yml`)

| 商店 | Secret | 后台获取路径 |
|---|---|---|
| 华为 | `HUAWEI_CLIENT_ID` `HUAWEI_CLIENT_SECRET` `HUAWEI_APP_ID` | AGC → 用户与访问 → API 客户端;App ID 在应用信息页 |
| vivo | `VIVO_ACCESS_KEY` `VIVO_ACCESS_SECRET` | 开放平台 → 账号/API 管理(需另申请「开放能力 → API 传包」权限) |
| 应用宝 | `TENCENT_USER_ID` `TENCENT_ACCESS_SECRET` `TENCENT_APP_ID` | 开放平台 → 账户管理 → API 发布接口 → 申请开通(**须主账号**) |
| OPPO | `OPPO_CLIENT_ID` `OPPO_CLIENT_SECRET` | 开放平台 → 管理中心 → 应用服务平台 → API Key 管理 |
| 小米 | `XIAOMI_USERNAME` `XIAOMI_PRIVATE_KEY` `XIAOMI_CERT_BASE64` | 开放平台「应用自动发布接口」页:账号邮箱、接口私钥(可重置)、公钥证书 .cer 的 base64 |

## 三、发一次版

推 tag(推荐)或在 Actions 页手动 `Run workflow`:

```bash
# iOS TestFlight
git tag ios-v0.1.0 && git push origin ios-v0.1.0

# Google Play 内测
git tag android-v0.1.0 && git push origin android-v0.1.0

# 国内五商店(华为/vivo/应用宝/OPPO/小米 并行)
git tag android-cn-v0.1.0 && git push origin android-cn-v0.1.0
```

手动触发可传:iOS `marketing_version` / `build_number` / `skip_preflight`;Android `version_name` / `version_code` / `track` / `release_status`;国内 `version_name` / `version_code` / `remark`(更新说明)/ `release_type`。

## 四、国内商店首次真跑需确认项

签名核心有单测,但**无各商店真实凭据、HTTP 链路未端到端验证**。首次真跑请留意各脚本 stderr 的报错码并按需调整(脚本均留了覆盖项):

- **vivo**:`sign_method` 字面值("HMAC-SHA256" vs "hmac"有分歧,当前用前者);multipart 文件字段名。可先手动打 `app.query.details` 验签。
- **应用宝**:通用 APK 默认放 64 位槽(`--arch 64`);分架构包需分别传。
- **OPPO**:生产域名(`OPPO_API_BASE` 可覆盖)、`/app/upd` 最小字段是否足够(否则补 `icon_url`/`pic_url`/描述)、`cpu_code`(`--cpu-code`)。
- **小米**:`icon` 官方标必填,当前「仅换包」最小模式未带(被拒需补);`synchroType` 默认 2 未经官方确认(`--synchro-type` 覆盖)。

OPPO / 小米按**「仅换包」最小字段**实现(已上架应用的版本更新,不重传 icon/截图);若被拒,按脚本提示补必填字段即可。

## 相关

- 本地发版脚本与 skill:`ios-test-flight`(iOS 打包上传)、`app-store-release`(App Store 提审)、`google-play-release`(Play 上架)。
- 签名纯函数与单测:`apps/android/scripts/lib/sign.mjs` + `sign.test.mjs`(`node --test apps/android/scripts/lib/sign.test.mjs`)。
- iOS 签名凭据申请见 [`apple-signin-credentials.md`](apple-signin-credentials.md)。

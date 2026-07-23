---
name: ios-test-flight
description: "打包构建 DocPilot iOS 应用并上传到 TestFlight。归档(archive)→ 导出直传(export destination=upload)→ App Store Connect,走 API Key 认证,自动生成单调递增的 build number。当用户要求打 TestFlight 包、发内测、archive 上传 App Store Connect、分发 iOS beta 时用。仅覆盖 apps/ios(iOS 26,xcodegen + xcodebuild),不碰 TS monorepo。"
when_to_use: "TestFlight, testflight, 打包上传, 打 TestFlight 包, 发内测, 内测分发, iOS beta, 上传 App Store Connect, archive 上传, xcodebuild archive, exportArchive, 分发 iOS, ship to testflight, upload build, iOS 发版"
dispatch_intent: "Build and ship the DocPilot iOS app to TestFlight from the command line: bump build number, xcodegen generate, xcodebuild archive with distribution signing, export with destination=upload via App Store Connect API key. Local operator tool, macOS + Xcode only."
---

# iOS TestFlight:命令行打包并同步到 TestFlight

把 `apps/ios` 的 DocPilot 原生 app **归档 → 导出直传 → TestFlight**。项目**不走 CI**、无
fastlane,本 skill 就是补上这段本地发布流程。全程用 **App Store Connect API Key** 认证(免交互、
无需 Apple ID 密码),用 `xcodebuild -exportArchive` 的 `destination=upload` 直传,不依赖已弃用的
`altool`。

> 只在 **macOS + Xcode 26** 上可跑。签名与上传需要**真实凭据**,与本地模拟器门禁无关。

## Outcome Contract

- Outcome: 一个新 build 出现在 App Store Connect → TestFlight,状态为 Processing/Ready to Test。
- Done when: `xcodebuild -exportArchive ... destination=upload` 返回 0,且 App Store Connect 能看到该
  build number。
- Output: 归档路径、导出日志、上传的 version(build) 号,以及后续在 App Store Connect 分配测试组的提示。

## 前置凭据(与「Sign in with Apple」的 .p8 不是同一个)

打 TestFlight 需要 **App Store Connect API Key**,和登录用的 SIWA key 是**两把不同的 key**。Team ID
的获取见 [`docs/runbooks/apple-signin-credentials.md`](../../../docs/runbooks/apple-signin-credentials.md);
其余三样在 **App Store Connect**(不是 developer.apple.com)申请:

| 变量 | 来源 | 说明 |
|---|---|---|
| `TEAM_ID` | Apple Developer → Membership | 10 位,= `DEVELOPMENT_TEAM` |
| `ASC_KEY_ID` | App Store Connect → Users and Access → **Integrations → App Store Connect API** → ➕ | 生成 key 时显示的 Key ID |
| `ASC_ISSUER_ID` | 同页顶部 **Issuer ID** | 整个团队一个,UUID 形 |
| `ASC_KEY_PATH` | 上面生成 key 后 **Download**(只能下一次)的 `AuthKey_XXXX.p8` | 建议放 `~/.appstoreconnect/private_keys/`,**绝不进 git** |

创建 API Key 时 **Access 选 App Manager**(或更高),否则无权上传 build。

**还需要**:① 已在 App Store Connect **创建了这个 app 记录**(Bundle ID `dev.w3ctech.docpilot`,首次
需在 My Apps → ➕ 手动建);② 团队里有 **Apple Distribution 证书**——本 skill 用
`-allowProvisioningUpdates` + API Key 让 Xcode 自动创建/下载分发证书与 profile,通常无需手动装。

## 上线前必查(否则包能传但是废的)

前两条(生产地址 / 审核账号)已由**发版前端到端冒烟门禁**自动兜底:上传脚本在 archive 前会先跑
`apps/ios/scripts/preflight-smoke.sh`——在模拟器里用审核账号「邮箱+密码」登录**生产**,红灯即
fail-closed 中止上传。所以正常路径下你**不必手动核对**下面 1;冒烟跑绿即已证明。

1. **`API_BASE_URL` 指向生产**。`apps/ios/Config/Release.xcconfig` 默认是占位
   `https://api.example.invalid`——**归档前务必改成真实生产 HTTPS 地址**,否则 TestFlight 包连不上后端。
   (占位地址下冒烟门禁会直接红。)
2. **审核账号已在生产就绪**。冒烟用 `review@docpilot.app` 登生产;若该账号未在生产重建,门禁会在
   「登录后仍停留在登录页」处红。见 `app-store-release`「演示/审核账号」。
3. **`DEVELOPMENT_TEAM`**。`apps/ios/project.yml` 里留空;脚本会在命令行用 `TEAM_ID` 覆盖,无需改文件。
4. **build number 必须单调递增**。TestFlight 拒绝重复的 (version, build)。脚本默认用时间戳
   `YYYYMMDDHHMM` 作 build number,天然递增;要固定值用 `--build <n>`。

## 怎么跑

一条命令(在仓库根):

```bash
export TEAM_ID=A1BCD23EFG
export ASC_KEY_ID=2ABCD3EFGH
export ASC_ISSUER_ID=69a6de70-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_2ABCD3EFGH.p8

.claude/skills/ios-test-flight/scripts/upload-testflight.sh
```

脚本按序做:校验凭据与工具 → **发版前端到端冒烟门禁**(`preflight-smoke.sh`,审核账号密码登生产,
红灯中止)→ `xcodegen generate` → `xcodebuild archive`(Release,分发签名)→ `xcodebuild -exportArchive`
(`destination=upload` 直传 App Store Connect)。产物在 `apps/ios/build/`(已被顶层 `.gitignore` 的
`build/` 忽略)。

冒烟也可**单独跑**(不上传,纯验证生产 + 审核账号):

```bash
apps/ios/scripts/preflight-smoke.sh
# 可覆盖:REVIEW_EMAIL / REVIEW_PASSWORD / SIMULATOR_NAME(默认 iPhone 16)
```

常用参数:

- `--build <n>` 指定 build number(默认时间戳)。
- `--version <x.y.z>` 覆盖 `MARKETING_VERSION`(默认取 `project.yml` 的 `0.1.0`)。
- `--dry-run` 只归档+导出到 `.ipa` **不上传**(用于本地核对签名),此时 ExportOptions 的
  `destination` 切为 `export`。
- `--skip-preflight` 跳过冒烟门禁(不推荐;仅当你刚单独跑过 `preflight-smoke.sh` 时用)。

跑完后到 App Store Connect → TestFlight,build 先 Processing(几分钟到半小时),转 Ready 后分配到内部/
外部测试组;外部测试组首个 build 需过 Beta App Review。

## 失败排查

- **`No profiles for 'dev.w3ctech.docpilot' were found`**:API Key 的 Access 不足(需 App Manager),
  或 app 记录还没在 App Store Connect 建。
- **`Provisioning profile ... doesn't include signing certificate`**:分发证书缺失;确认
  `-allowProvisioningUpdates` 生效且 API Key 可写,或在 Xcode 里先手动 Archive 一次让它建证书。
- **上传报 build 重复**:build number 撞了,用 `--build` 递增或依赖默认时间戳。
- **`altool` / `notarytool` 相关**:本 skill **不用** altool;notarytool 是公证(面向 Mac app 直分发),
  与 TestFlight 无关,别混。
- **归档成功但 TestFlight 里 app 连不上后端**:`Release.xcconfig` 的 `API_BASE_URL` 还是占位值。

## 铁律

- **凭据只走环境变量**,`.p8` 放 `~/.appstoreconnect/private_keys/`,任何 key / issuer / p8 **绝不进 git**。
- **归档前确认 `Release.xcconfig` 的 `API_BASE_URL` 是生产地址**,这是最容易漏、最难在 TestFlight 里发现的坑。
- **只动 `apps/ios`**;需要改 API/契约形状时回报,不在 Swift 侧硬绕(见 ios-native 分工)。

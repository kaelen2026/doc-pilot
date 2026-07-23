# DocPilot iOS 客户端

SwiftUI 原生客户端，**仅支持 iOS 26**(Swift 6，Liquid Glass），共用 DocPilot HTTP API。
早期的 iPad / macOS 目标已移除；项目**不走 CI**，门禁靠本地 xcodebuild 跑绿。

```bash
# 改了 project.yml 后重新生成工程
xcodegen generate --spec apps/ios/project.yml
open apps/ios/DocPilot.xcodeproj
```

Scheme：

- `docpilot` —— 主 app,含单元测试(`DocPilotTests`)。
- `DocPilotLiveSmoke` —— UI 冒烟(`DocPilotUITests`)。

## 发版前端到端验证

`DocPilotUITests` 里有两条端到端冒烟,都默认 skip、靠 `TEST_RUNNER_*` 开关触发:

- `LiveSmokeTests` —— OTP 邮箱登录全链路,**依赖本地 Mailpit 抓验证码**(先 `pnpm dev:local`),
  用于本地联调。开关 `TEST_RUNNER_LIVE_SMOKE=1`。
- `ReviewLoginSmokeTests` —— 审核账号「邮箱+密码」登录 + 主导航,**不依赖邮件服务**,故可对着
  **生产**全自动跑。这是提审 / TestFlight 上传前的门禁。

发版前一键跑(Release 配置 → 吃 `Config/Release.xcconfig` 的生产 `API_BASE_URL`;占位地址会红):

```bash
apps/ios/scripts/preflight-smoke.sh
# 可覆盖:REVIEW_EMAIL / REVIEW_PASSWORD / SIMULATOR_NAME(默认自动挑第一台可用 iPhone,如 "iPhone 17 Pro Max")
```

`ios-test-flight` 的 `upload-testflight.sh` 会在 archive 前自动调用它,红灯 fail-closed 阻止上传废包。

Bundle id `dev.w3ctech.docpilot`(工程 target 仍名 `DocPilot`,工程文件仍是 `DocPilot.xcodeproj`)。

Debug 默认连接 `http://127.0.0.1:3001`(`NSAllowsLocalNetworking` 已开)。Release 构建必须
通过 xcconfig(`Config/Release.xcconfig`)覆盖 `API_BASE_URL` 为生产 HTTPS 地址；项目不提交
签名 Team ID（`DEVELOPMENT_TEAM` 留空,本地自动签名）。

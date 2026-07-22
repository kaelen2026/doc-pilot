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

Debug 默认连接 `http://127.0.0.1:3001`(`NSAllowsLocalNetworking` 已开)。Release 构建必须
通过 xcconfig(`Config/Release.xcconfig`)覆盖 `API_BASE_URL` 为生产 HTTPS 地址；项目不提交
签名 Team ID（`DEVELOPMENT_TEAM` 留空,本地自动签名）。

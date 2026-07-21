# DocPilot Apple 客户端

SwiftUI 多平台客户端，最低支持 iOS/iPadOS 17 与 macOS 14，共用 DocPilot HTTP API。

```bash
xcodegen generate --spec apps/apple/project.yml
open apps/apple/DocPilot.xcodeproj
```

Debug 默认连接 `http://127.0.0.1:3001`。Release 构建必须通过 xcconfig 或 CI 覆盖
`API_BASE_URL` 为生产 HTTPS 地址；项目不提交签名 Team ID。

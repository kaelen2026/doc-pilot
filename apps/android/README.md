# DocPilot Android 客户端

Kotlin + Jetpack Compose 原生客户端，最低支持 Android 12（API 31），application ID 为
`dev.w3ctech.docpilot`。

## 本地构建

需要 JDK 17、Android SDK 36。Debug 默认连接 Android 模拟器宿主机的
`http://10.0.2.2:3001`：

```bash
cd apps/android
./gradlew testDebugUnitTest assembleDebug
```

自定义 API 地址：

```bash
./gradlew assembleDebug -PDOC_PILOT_API_URL=https://api.example.com
```

Google 登录使用 Web OAuth Client ID（服务端用同一 audience 校验）：

```bash
./gradlew assembleDebug \
  -PDOC_PILOT_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

服务端同时配置 `GOOGLE_ANDROID_CLIENT_ID`，值与上面一致。

APK 输出在 `app/build/outputs/apk/debug/app-debug.apk`。

## Firebase

真实 FCM 需在本地放置 `app/google-services.json` 并配置与
`dev.w3ctech.docpilot` 匹配的 Firebase Android App。该文件已被 `.gitignore` 排除。
客户端会在登录、恢复会话和 token 刷新时向 `/push/devices` 注册 `platform=android`。
Worker 通过 `FCM_SERVICE_ACCOUNT_JSON` 使用 Firebase Admin SDK 投递；缺配置时仅跳过 FCM，
不影响文档处理和 APNs。

## 已接入能力

- 邮箱 OTP、邮箱密码、会话恢复与加密存储；
- PDF 列表、预签名直传、处理状态；
- PDF 私有缓存、按页渲染、问答引用跳页；
- SSE 流式问答、搜索、通知、账户用量、退出与注销；
- FCM 接收与 token 注册；
- Credential Manager 原生 Google 登录；
- CameraX + ML Kit 二维码扫描及用户码确认；
- Room 按用户、文档和页码隔离的本地高亮；
- Firebase Messaging 接收及 Worker FCM HTTP v1 投递。

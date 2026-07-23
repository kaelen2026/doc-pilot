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

APK 输出在 `app/build/outputs/apk/debug/app-debug.apk`。

## Firebase

真实 FCM 需在本地放置 `app/google-services.json` 并配置与
`dev.w3ctech.docpilot` 匹配的 Firebase Android App。该文件已被 `.gitignore` 排除。
客户端会在 token 刷新时向 `/push/devices` 注册 `platform=android`。

## 已接入能力

- 邮箱 OTP、邮箱密码、会话恢复与加密存储；
- PDF 列表、预签名直传、处理状态；
- PDF 私有缓存、按页渲染、问答引用跳页；
- SSE 流式问答、搜索、通知、账户用量、退出与注销；
- FCM 接收与 token 注册；
- 扫码登录的用户码认领/确认 API。

Google 登录需要配置 OAuth client ID 后启用 Credential Manager 接线。CameraX/ML Kit
相机取码和服务端 FCM HTTP v1 投递仍需在生产 Firebase 工程配置完成后联调。

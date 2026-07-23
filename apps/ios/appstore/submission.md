# DocPilot App Store 提审资料

App Store 提审的填报清单与资产。流程细节见 `.claude/skills/app-store-release`;
本目录是 DocPilot 具体的填报值与截图。截图在 `screenshots/6.7/`(1284×2778)。

> **演示账号密码不入库**:账号 `review@docpilot.app`,密码见 `.env` / 团队私密渠道
> (勿在此文件或任何提交里写明文口令)。

## 🔴 提审前硬阻断(未解决别提交)

1. 部署生产后端 + 拿到真实 HTTPS 域名(见 `docs/runbooks/deployment.md`)。
2. `apps/ios/Config/Release.xcconfig` 的 `API_BASE_URL` 改成生产域名(现为占位 `api.example.invalid`)。
3. 在**生产**重建演示账号并灌几份文档 + 一个带引用的会话。
4. 用 `ios-test-flight` 重打一版**连生产**的包,上传 TestFlight,处理完成。
5. 隐私政策页(`apps/web/app/privacy`)部署上线;填其中占位(运营主体、联系邮箱、AI 服务商名单、年龄门槛、生效日期)。

## ② App Store Connect 元数据

- 名称:`DocPilot`
- 副标题(≤30):`把每份 PDF 读成能对话的档案`
- 类别:Productivity(主)
- 隐私政策 URL:`https://<生产域名>/privacy`
- 支持 URL(必填):`https://<生产域名>`
- 描述(草稿):

  ```
  DocPilot 是一款 AI 文档工作台。上传 PDF,它自动解析、切片、向量化并生成摘要,
  再基于全文回答你的提问——每条回答都附原文页码引用,点开即定位到该页逐句核对。
  当文档中没有支撑证据时,DocPilot 会明确拒答而非猜测,让每条引用都可信。

  • 上传即读:拖入 PDF 在线翻阅,单文件最大 50MB、500 页
  • 问得到:基于全文检索作答,答案带页码引用可回溯
  • 读得懂:自动生成整篇摘要,处理进度全程可见
  • 多端登录:邮箱验证码 / 邮箱密码 / Apple / Google
  ```

- 关键词(≤100 字符):`PDF,文档,AI,问答,阅读,摘要,论文,合同,引用,检索,知识库`
- 新功能(首版):`首次发布。`
- App 图标:朱印「档」1024×1024,无 alpha。
- 截图:`screenshots/6.7/`(01 文档列表 / 02 阅读器 / 03 带引用问答 / 04 账户),**1284×2778**。
  - ⚠️ ASC 的 iPhone 截图槽位**不自动缩放**:该槽位只收 `1242×2688`(6.5")或 `1284×2778`(6.7");6.9"(1320×2868)在此槽位会被拒(见错误码「dimensions are wrong」)。本目录已是 1284×2778。
- 价格与销售范围、年龄分级问卷:按商业/内容决定。

## ② App Privacy 数据标签(须与实际一致,上架前对着 observability / AI 网关留存复核)

| 数据 | Apple 类目 | 关联身份 | 用途 | 追踪 |
|---|---|---|---|---|
| 邮箱地址 | Contact Info → Email Address | 是 | App 功能(账户) | 否 |
| 上传文档与问答内容 | User Content → Other User Content | 是 | App 功能 | 否 |
| 用户 ID | Identifiers → User ID | 是 | App 功能 | 否 |
| APNs 推送令牌 | Identifiers → Device ID | 是 | App 功能(通知) | 否 |
| 用量/配额、诊断日志 | Usage Data / Diagnostics | 是 | App 功能、防滥用/排障 | 否 |

- 不出售个人信息;不用于第三方广告/追踪。
- 相机仅用于扫码登录,不采集照片 → 不申报 Photos。

## ② 审核信息(Review Notes)——最常被漏,漏了必被打回

- 演示账号:`review@docpilot.app`(密码见 `.env` / 私密渠道)。
- Review Notes:

  ```
  登录:在登录页选「密码 / Password」方式,用演示邮箱+密码登录。
  (也支持邮箱验证码、Sign in with Apple、Google。)
  账号内已有示例文档与一个带原文引用的问答会话可直接查看。
  可在「账户」页删除账户(7 天冷静期可撤销)。

  Sign in: on the login screen choose "密码/Password" and use the demo email + password.
  The account already contains sample documents and a Q&A conversation with citations.
  Account deletion is under the "账户/Account" tab (7-day cooling-off, reversible).
  ```

## ④ 提交审核

1. 选一版**连生产后端**的 build(别选内测 LAN IP 版)。
2. 确认 ①②③ 齐:隐私政策 URL、元数据、App Privacy、截图、演示账号。
3. 出口合规:Info.plist 已声明 `ITSAppUsesNonExemptEncryption=false`,若问到选「仅豁免加密」。
4. 建议手动发布:审过后自己点上架。
5. Submit for Review → 状态转 Waiting for Review。

## 截图说明

`screenshots/6.7/` 当前为**本地种子数据**拍摄的临时基线(2026-07-23,UITest 采集,
6.9" 原图等比缩至宽 1284 再居中裁到 2778 得 1284×2778)。
正式提审前建议换**生产**真实内容重拍(用 `.claude/skills/app-store-release/scripts/capture-screenshots.sh`,
并按需转成 ASC 槽位接受的 1242×2688 / 1284×2778)。

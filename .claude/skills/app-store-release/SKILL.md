---
name: app-store-release
description: "把 DocPilot iOS 从「TestFlight 可跑」推到「已提交 App Store 审核」:隐私政策上线 → 填 App Store Connect 元数据 + 截图 → 提交审核。承接 ios-test-flight(它负责打包上传),本 skill 负责上架前的合规、元数据与提审。仅覆盖 apps/ios(截图)+ apps/web(隐私政策页)+ App Store Connect 操作,不碰 TS 业务逻辑。"
when_to_use: "上架, App Store 上架, 提审, 提交审核, 送审, App Store 发布, 上线 App Store, 隐私政策, privacy policy, App Store 元数据, metadata, 应用截图, screenshots, App Privacy 标签, 审核被拒, submit for review, app store submission, ship to app store, release to app store, app store listing"
dispatch_intent: "Take the DocPilot iOS app from TestFlight-ready to submitted-for-App-Store-review: publish a privacy policy page on the web app, fill in App Store Connect metadata and App Privacy labels, capture and upload required iPhone screenshots, then submit for review. Guided operator workflow; only screenshot capture is scripted (local, safe). Complements ios-test-flight."
---

# App Store 上架:隐私政策 → 元数据 + 截图 → 提审

`ios-test-flight` 把包送进了 TestFlight;本 skill 接着把 DocPilot 推到 **App Store 审核队列**。
分四步:**① 隐私政策上线 → ② 填 App Store Connect 元数据 + App Privacy 标签 → ③ 截图 →
④ 提交审核**。

> **自动化边界(铁律):** 只有**本地、安全、可重复**的活才脚本化——即**截图采集**
> (`scripts/capture-screenshots.sh`,跑模拟器截图,不碰网络、不改任何线上记录)。
> **凡是会改写 App Store Connect 上真实 app 记录的操作(元数据、隐私标签、提审)一律走
> 人工引导步骤**,由你在 ASC 网页端有意识地执行——不拿未经测试的 API 写你的正式 app 记录。

## Outcome Contract

- Outcome:DocPilot 在 App Store Connect 里状态变为 **Waiting for Review**(已提交待审)。
- Done when:选定 build + 元数据 + 截图 + App Privacy + 出口合规全部齐备,点 **Submit for Review** 无报错。
- Output:线上隐私政策 URL、填好的元数据清单、`apps/ios/build/screenshots/` 下的截图、提交回执与后续「审核中 → 上架 / 被拒」的跟进提示。

## 前置(硬阻断,不齐别开工)

按 `docs/` 权威口径,以下三样缺任一都过不了审:

1. **生产后端已上线且公网可达。** 审核员会真的点开用,连不上后端直接拒(Guideline 2.1)。
   打提审包前,`apps/ios/Config/Release.xcconfig` 的 `API_BASE_URL` **必须是真实生产 HTTPS 域名**
   (不是 `api.example.invalid`,也不是内测的 LAN IP)——这是 [[ios-test-flight]] 里反复强调、
   最难在成品里发现的坑。部署见 `docs/runbooks/deployment.md`。
2. **App 内有「删除账户」入口(Apple 5.1.1(v) 强制)。** 支持注册就必须支持 app 内自助删号。
   后端注销(7 天冷静期 + 到期硬删)已在,但 iOS `Features/Account` 需接上入口——没有必被拒。
3. **一版针对生产后端的 build 已经过 `ios-test-flight` 上传**并在 TestFlight 处理完成。

## 步骤

### ① 隐私政策(+ 服务条款)上线

App Store Connect 的隐私政策 URL 是**必填**,且用了账户 / 相机 / 推送,页面必须真实可访问。

- **落点:web app,不是 iOS。** 在 `apps/web/app/privacy/page.tsx`(可再加 `terms/page.tsx`)
  建静态页,走**墨水纸设计 token**(`bg-paper` / `text-ink` / `text-seal` …,见 [[design-direction-ink-paper]]
  与 `frontend.md`),中文正文。上线后 URL 即 `${NEXT_PUBLIC_APP_URL}/privacy`。
- **至少覆盖**(据 DocPilot 实际收集据实写,别抄模板):
  - 收集什么:账户邮箱(OTP / Sign in with Apple)、上传的 PDF 文档与问答内容、用量/配额、
    APNS 推送 token、必要的诊断日志。
  - 用途:提供文档解析 / RAG 问答、账户与工作区、推送通知、防滥用与容量。
  - 第三方:AI 网关(见 `docs/architecture/rag.md`)、对象存储等**数据处理方**要点名。
  - 用户权利:**删除账户**(7 天冷静期可撤销、到期硬删)、导出/联系方式。
  - 留真实联系邮箱与生效日期。
- ⚠️ 这是**产品/法务内容**,不是法律意见;拿不准的条款请自行核实或找法务过一遍。
- 页面上线后,把 URL 填进 **ASC → App 信息 → 隐私政策 URL**。

### ② App Store Connect 元数据 + App Privacy 标签

在 **ASC → 你的 App → 该版本** 逐项填(中文区 + 需要的英文区):

- **文案**:名称、副标题、**描述**、**关键词**、What's New(首版可写「首次发布」)、
  推广文本(可选)。
- **URL**:支持 URL(必填,给个能联系到你的页面)、营销 URL(可选)。
- **App 图标**:用现有朱印「档」1024×1024(见 [[brand-logo-seal]]);不带 alpha 通道。
- **年龄分级**:填内容分级问卷。
- **价格与销售范围**:免费 / 付费、上架国家/地区。
- **App Privacy(数据标签,必填,据实声明)**:按①里列的收集项映射到 Apple 的类目——
  典型有 **Contact Info(邮箱)**、**User Content(文档/问答)**、**Identifiers(用户/设备 ID)**,
  按后端/AI 网关实际留存情况判断是否含 **Usage Data / Diagnostics**,以及是否**关联身份**。
  拿不准就对着 `observability` 与 AI 网关实际记录了什么来定,别多报也别漏报。
- **审核信息**:
  - **演示账号**:审核员要能登录。OTP 登录给一个可收验证码的测试邮箱,或在 **Review Notes**
    写清 OTP 怎么走(甚至提供固定验证码通道);SIWA 也说明。**这一步最常被漏,漏了必被打回。**
  - 联系人电话/邮箱。

### ③ 截图(脚本采集 → 人工上传)

iPhone-only app 需要 **6.9" 一组**竖屏截图(本机最新为 **iPhone 17 Pro Max**);ASC 会用它
自动缩放到其它尺寸。每组 1–10 张。

跑采集脚本(在仓库根或本 worktree):

```bash
.claude/skills/app-store-release/scripts/capture-screenshots.sh --api-base https://<生产域名>
```

脚本做:选机型(默认自动挑最新 Pro Max,可 `--device "iPhone 17 Pro Max"`)→ `xcodegen` →
按模拟器 SDK 构建并安装 app → 启动 → **交互式**逐屏截图(你导航到目标画面,回车即截)。
产物默认落 `apps/ios/build/screenshots/`(已被 `build/` gitignore)。常用参数:

- `--api-base <url>`:模拟器里 app 连的后端(要有**真实内容**才好看;用生产或有数据的 staging)。
- `--device "<名>"`:指定机型;`--out <dir>`:改输出目录。

建议覆盖 DocPilot 的**核心价值画面**:登录 → 文档列表 → 阅读器(PDF)→ **带引用的问答**
(RAG 的招牌)→ 搜索。**避免**空态、占位、含真实隐私的内容。截好在 ASC 里手动上传到该版本。

> 截图需要 app 里有内容 = 需登录 + 已解析文档,脚本没法替你造数据;导航与造数是人工的,
> 脚本只负责可靠地「按下快门」。

### ④ 提交审核

ASC → 该版本:

1. **选 build**:选 `ios-test-flight` 传上来、连的是**生产后端**的那一版(别选内测 LAN IP 版)。
2. 确认①②③齐备:隐私政策 URL、元数据、App Privacy、截图、演示账号。
3. **出口合规**:已在 Info.plist 声明 `ITSAppUsesNonExemptEncryption=false`(仅 HTTPS + SHA-256
   哈希,属豁免),正常不再追问;若问到,选「仅豁免加密」。
4. 可选**分阶段发布 / 手动发布**:建议手动发布,审过后你自己点上架。
5. **Submit for Review** → 状态转 **Waiting for Review**。

## 失败排查(常见被拒)

- **5.1.1(v) 账户删除缺失**:app 里必须有自助删号入口(见前置②),仅后端能删不算。
- **隐私政策不可达 / 内容不符**:URL 打不开、或声明与 App Privacy 标签对不上 → 补齐再交。
- **演示账号缺失或登不进**:审核员进不去 = 直接打回;OTP 务必给可用通道或固定验证码说明。
- **2.1 崩溃 / 连不上后端**:提审包连的是内测 LAN IP 或后端没上线 → 换生产域名重打包(`ios-test-flight`)。
- **App Privacy 与实际不符**:少报数据收集会被拒;对着 `observability` / AI 网关实际留存据实填。
- **截图含占位/空态或与功能不符**:用有真实内容的画面重截。

## 铁律

- **自动化只碰本地安全操作(截图)**;元数据/隐私标签/提审是人工在 ASC 有意识执行,不用未测 API 写正式记录。
- **提审包必连生产后端**:交之前再确认 `Release.xcconfig` 的 `API_BASE_URL` 是生产域名——上架最易漏的坑。
- **只动 `apps/ios`(截图)、`apps/web`(隐私页)与 ASC**;要改 API/契约形状回报,不在别处硬绕(见 ios-native 分工)。
- **流程照 [`workflow.md`](../../rules/workflow.md)**:平级 worktree 起分支 → PR → CI 门禁 → 合并后清理分支(`git ls-remote` 验证远端已删)。
- 凭据(ASC API Key / Issuer / Team)与 [[ios-testflight-credentials]] 同源,只走环境变量,`.p8` 不进 git。

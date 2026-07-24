---
name: google-play-release
description: "把 DocPilot Android 从「能本地跑」推到「已提交 Google Play 审核」:配置上传签名 → 构建签名 AAB → 隐私政策 + 账户删除 URL 上线 → 填 Play Console 商品详情 + Data safety(数据安全)表单 + 内容分级 → 内测轨道(closed testing)→ 生产提审。仅覆盖 apps/android(构建/签名)+ apps/web(隐私/删号页)+ Play Console 操作,不碰 TS 业务逻辑。"
when_to_use: "Google Play, Play Store, Play Console, 上架 Google Play, 发布安卓, 安卓上架, Android 发版, 提审, 送审, 提交审核, AAB, app bundle, 应用签名, 上传密钥, upload key, keystore, 内测轨道, closed testing, internal testing, Data safety, 数据安全表单, 内容分级, content rating, 账户删除 URL, 隐私政策, privacy policy, publish to google play, release to play store, ship android, submit for review, play store listing, bundleRelease"
dispatch_intent: "Take the DocPilot Android app from locally-runnable to submitted-for-Google-Play-review: set up an upload-key signing config, build a signed release AAB pointed at production, publish the privacy-policy and account-deletion web pages, fill in Play Console store listing + Data safety form + content rating, run the required closed test, then submit to production. Local signed-AAB build is scripted (safe, repeatable); everything that writes the real Play listing is human-guided in Play Console. Android-only; complements the iOS app-store-release skill."
---

# Google Play 上架:签名 AAB → 合规页面 → Play Console 元数据 → 内测 → 提审

iOS 那条链路是 [[ios-test-flight]] + `app-store-release`;本 skill 是它的 **Android 对应物**,把
`apps/android` 的 DocPilot 从「本地能跑」推到 **Google Play 生产审核队列**。五步:
**① 配置上传签名 → ② 构建生产签名 AAB → ③ 隐私政策 + 账户删除 URL 上线 → ④ 填 Play Console
商品详情 + Data safety + 内容分级 → ⑤ 内测轨道达标 → 生产提审**。

> **自动化边界(铁律,与 `app-store-release` 一致):** 只有**本地、安全、可重复**的活才脚本化——
> 即**签名 AAB 构建**(`scripts/build-release.sh`,纯本地 Gradle 构建 + 用上传密钥签名,不碰网络、
> 不改任何线上记录)。**凡是会改写 Play Console 上真实 app 记录的操作(上传轨道、商品详情、
> Data safety、内容分级、提审)一律走人工引导步骤**,由你在 Play Console 网页端有意识地执行——
> 不拿脚本去写你的正式 app 记录。

## Outcome Contract

- Outcome:DocPilot 在 Google Play Console 里进入 **In review**(生产版本已提交待审);无生产权限的
  新账号先达成「Closed testing 已提交并进入 14 天评估」。
- Done when:签名 AAB 构建成功且 `jarsigner -verify` 通过;隐私政策 + 账户删除 URL 公网可达;
  商品详情 + Data safety + 内容分级 + 目标受众全部齐备;上传到轨道无「未签名 / 版本号重复 /
  未声明权限」报错;点 **Send for review** 无阻断。
- Output:签名 `.aab` 路径与 versionCode/versionName、线上隐私政策与删号 URL、填好的元数据/
  Data safety 清单、提交回执,以及后续「审核中 → 上架 / 被拒」的跟进提示。

## 前置(硬阻断,不齐别开工)

按 `docs/` 权威口径与 Play 政策,以下缺任一都过不了审:

1. **生产后端已上线且公网可达。** 审核员会真的点开用,连不上后端直接拒。构建生产包时脚本用
   `--api-base` 把 `DOC_PILOT_API_URL` 注入 `BuildConfig.API_BASE_URL`——**必须是真实生产 HTTPS 域名**
   (不是 `http://10.0.2.2:3001` 的模拟器宿主地址,也不是内测 LAN IP)。这是最难在成品里发现的坑,
   与 [[ios-test-flight]] 里反复强调的同一件事。部署见 `docs/runbooks/deployment.md`。
2. **App 内有「删除账户」入口,且有一个公开的**删号 Web URL。** Play 的 Data safety「数据删除」项**强制**
   要求一个**任何人(哪怕已卸载)都能访问的网页**发起账户 + 数据删除请求。DocPilot 后端注销
   (7 天冷静期可撤销、到期硬删)已在,Android 端「退出与注销」入口也在(见 `apps/android/README.md`);
   本 skill 步骤③补上那个 Web URL(落在 `apps/web`)。
3. **Google Play 开发者账号已就绪**:已付 $25 一次性注册费、已过身份验证。**注意**:2023-11-13 之后
   新建的**个人账号**,首个 app 必须先跑满 **12 名测试者 × 连续 14 天的 Closed testing** 才解锁生产
   发布(见步骤⑤)——这不是可跳过的,提前排期。
4. **Google 登录 OAuth 与 Firebase 配置对齐生产**:构建生产包时用 `--google-client-id` 传 Web OAuth
   Client ID(服务端同一 audience 校验);真实 FCM 需本地放 `apps/android/app/google-services.json`
   (已 gitignore)且 Firebase Android App 的**签名证书 SHA-256** 要登记 **Play App Signing 的证书**
   (见步骤⑤「App signing」——Google 重签后 SHA 会变,别只登记上传密钥的)。

## 步骤

### ① 一次性:创建上传密钥 + 给 release 配签名(代码改动,走 PR)

Play 用 **Play App Signing**:你持有**上传密钥(upload key)**给 AAB 签名,Google 持有真正的
**应用签名密钥**并在分发时重签。你只需要一把上传密钥。

**a. 生成上传密钥库(放仓库外,绝不进 git):**

```bash
keytool -genkeypair -v \
  -keystore ~/.android-keystores/docpilot-upload.jks \
  -alias docpilot-upload \
  -keyalg RSA -keysize 2048 -validity 10000
# 记住 store 口令、key 别名、key 口令——它们只经环境变量进构建,不写进仓库
```

**b. 给 `apps/android/app/build.gradle.kts` 加 release 签名(唯一一次代码改动)。** 现状 release
`buildType` **没有 signingConfig**,直接 `bundleRelease` 出的是未签名包,Play 不收。按下面改——密钥
路径与口令全部从 **Gradle property** 读(由脚本用 `-P` 从环境变量注入),仓库里不留任何机密:

```kotlin
android {
  // …保留现有 namespace/compileSdk…

  signingConfigs {
    create("release") {
      storeFile = providers.gradleProperty("DOC_PILOT_UPLOAD_STORE_FILE").orNull?.let(::file)
      storePassword = providers.gradleProperty("DOC_PILOT_UPLOAD_STORE_PASSWORD").orNull
      keyAlias = providers.gradleProperty("DOC_PILOT_UPLOAD_KEY_ALIAS").orNull
      keyPassword = providers.gradleProperty("DOC_PILOT_UPLOAD_KEY_PASSWORD").orNull
    }
  }

  defaultConfig {
    // …保留现有 applicationId/minSdk/targetSdk…
    // 版本号改为可被脚本覆盖,缺省回退当前字面量(便于本地构建)
    versionCode = providers.gradleProperty("DOC_PILOT_VERSION_CODE").map(String::toInt).orElse(1).get()
    versionName = providers.gradleProperty("DOC_PILOT_VERSION_NAME").orElse("0.1.0").get()
    // …保留现有 buildConfigField(API_BASE_URL / GOOGLE_CLIENT_ID)…
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")  // ← 新增
    }
  }
}
```

`targetSdk = 36` 已满足 Play 2026-08-31 起「新 app / 更新须 target API 36」的要求,无需动。
这步是一个**独立可验收的垂直切片**(「release 构建产出用上传密钥签名的 AAB」),按
[`workflow.md`](../../rules/workflow.md) 走 worktree → PR;交给 **android-native 子代理**落更合适
(它专管 `apps/android`)。

### ② 构建生产签名 AAB(脚本,本地安全)

密钥与口令只经环境变量传入,`.aab` 输出在 `build/`(已 gitignore)。在仓库根跑:

```bash
export DOC_PILOT_UPLOAD_KEYSTORE=~/.android-keystores/docpilot-upload.jks
export DOC_PILOT_UPLOAD_STORE_PASSWORD='…'
export DOC_PILOT_UPLOAD_KEY_ALIAS=docpilot-upload
export DOC_PILOT_UPLOAD_KEY_PASSWORD='…'

.claude/skills/google-play-release/scripts/build-release.sh \
  --api-base https://<生产域名> \
  --google-client-id <xxx.apps.googleusercontent.com> \
  --version 0.1.0
```

脚本按序做:校验密钥/工具/`--api-base` 是生产 HTTPS(非 `10.0.2.2`/`localhost`/LAN,占位即中止)→
`./gradlew :app:bundleRelease`(把签名、API 地址、Google Client ID、版本号作为 `-P` 属性注入)→
`jarsigner -verify` 校验签名 → 打印 AAB 路径与版本号。产物在
`apps/android/app/build/outputs/bundle/release/app-release.aab`。

常用参数:

- `--api-base <url>`(**生产包必填**)→ `DOC_PILOT_API_URL`。
- `--google-client-id <id>` → `DOC_PILOT_GOOGLE_CLIENT_ID`(Web OAuth Client ID)。
- `--version <x.y.z>` 覆盖 `versionName`(默认取 build.gradle 的 `0.1.0`)。
- `--code <n>` 覆盖 `versionCode`(默认用 `date +%s` 时间戳,**整数、单调递增、< 21 亿**;Play 拒收
  重复或更小的 versionCode)。
- `--apk` 顺带产出一个签名 APK 供旁装冒烟(Play 上架用 AAB,不用 APK)。

### ③ 隐私政策 + 账户删除 Web URL 上线(落 `apps/web`)

- **隐私政策**:`apps/web/app/privacy/page.tsx` **已存在**(iOS 上架时建的)。复用同一页填 Play Console
  的隐私政策 URL(`${NEXT_PUBLIC_APP_URL}/privacy`)。若内容还不完整,按 `app-store-release` 步骤①
  的清单据实补(收集项、用途、第三方 AI 网关/对象存储、用户权利、联系邮箱、生效日期),走**墨水纸
  设计 token**(见 [[design-direction-ink-paper]] 与 `frontend.md`),中文正文。
- **账户删除 Web URL(Play 强制、iOS 没有的额外项)**:需要一个**公网可访问、无需登录**也能看到
  「如何删除账户与数据」的页面。最省的做法是在隐私页加一个带锚点的「账户与数据删除」小节
  (`${NEXT_PUBLIC_APP_URL}/privacy#account-deletion`),说明:app 内「设置 → 注销」发起;或未安装时
  发邮件到 xxx@ 请求;删除范围(账户、工作区、上传文档与问答);**7 天冷静期后硬删**的时效。
  也可另建 `apps/web/app/account-deletion/page.tsx` 单独承接。
- ⚠️ 这是**产品/法务内容**,不是法律意见;拿不准的条款自行核实或找法务过一遍。

### ④ Play Console:商品详情 + Data safety + 内容分级(人工在网页端)

在 **Play Console → 你的 App** 逐项填(中文 + 需要的英文):

- **首次建 app**:Play Console → Create app,填 app 名称、默认语言、App/Game、免费/付费。applicationId
  锁定为 `dev.w3ctech.docpilot`(与 `build.gradle.kts` 一致,建后不可改)。
- **商品详情(Main store listing)**:app 名称、简短说明(≤80 字)、完整说明、应用图标
  **512×512 32-bit PNG**(用现有朱印「档」,见 [[brand-logo-seal]])、**特色图片(feature graphic)
  1024×500**、**手机截图**(2–8 张,建议 1080×1920 一类竖屏)。截图覆盖核心价值画面:登录 → 文档列表
  → 阅读器(PDF)→ **带引用的问答**(RAG 招牌)→ 搜索;避免空态/占位/真实隐私。安卓截图可用
  `adb exec-out screencap -p > shot.png` 在真机/模拟器采集(此步为人工,脚本不代造数据)。
- **App content(应用内容)——逐项声明,缺一项都发不了:**
  - **隐私政策 URL**:填步骤③的线上地址。
  - **Data safety(数据安全表单)**:据实声明收集/共享的数据——典型有 **个人信息(邮箱)**、
    **App 活动/用户内容(上传文档与问答)**、**App 信息与性能(诊断日志)**、**设备/其他 ID**。
    对着 `observability` 与 AI 网关(`docs/architecture/rag.md`)**实际留存**了什么来判定是否加密传输、
    是否可请求删除,别多报也别漏报。**「数据删除」子项填步骤③的删号 Web URL。**
  - **内容分级(Content rating)**:填 IARC 问卷。
  - **目标受众与内容(Target audience)**:选年龄段(非儿童向)。
  - **广告**:声明无广告(DocPilot 无广告 SDK)。
  - **权限说明**:manifest 声明了 `CAMERA`(二维码扫描)、`POST_NOTIFICATIONS`(推送)、`INTERNET`;
    如被问到敏感权限用途,据实说明(相机仅用于扫码登录/绑定,不做后台采集)。
- **审核测试账号**:App content → 或在轨道发布备注里,提供审核员能登录的账号。OTP 登录给一个可收
  验证码的测试邮箱,或在备注写清 OTP 通道;Google 登录另附说明。**这一步最常被漏,漏了必被打回。**

### ⑤ 上传 AAB → 内测轨道 → 生产提审(人工在网页端)

1. **App integrity / App signing**:首次上传 AAB 时选择 **Play App Signing**(推荐,Google 托管签名密钥)。
   记下 Google 生成的**应用签名证书 SHA-256**,回填到 **Firebase Android App**(否则生产包的 Google 登录 /
   FCM 因 SHA 不匹配而失效——这是前置④点名的坑)。
2. **上传到轨道**:Play Console → Testing → **Internal testing**(或 Closed testing)→ Create release →
   上传步骤②的 `app-release.aab` → 填 Release notes → Review → Roll out。先内测冒烟(用轨道链接真机安装,
   走一遍登录 → 上传 → 问答带引用),确认连的是**生产后端**且功能正常。
3. **新个人账号的生产门禁**:若账号受 12 测试者 × 14 天 Closed testing 限制,必须先在 **Closed testing**
   轨道拉满 12 名测试者、连续 14 天,达标后 Play Console 才放开「Apply for production」。这段是**日历时间**,
   提前排。老账号 / 组织账号通常无此限制,可直接走 Production。
4. **生产提审**:Production → Create release → 选步骤②那版(连**生产后端**的)AAB → 填 Release notes →
   Countries/regions → **Send for review**。可选**分阶段发布(staged rollout)**,建议首发小比例灰度。
5. 状态转 **In review**;审核期通常几小时到几天,通过后按你设的 rollout 上架。

## 失败排查(常见被拒 / 上传报错)

- **上传报「未签名 / 签名无效」**:release 没接 signingConfig(步骤①漏了),或 `-P` 密钥属性没传进去;
  本地先 `jarsigner -verify -verbose app-release.aab` 自查。
- **「versionCode 已存在 / 必须更大」**:versionCode 撞了或更小,用 `--code` 递增(默认时间戳天然递增)。
- **「You need to use a different package name」/ applicationId 冲突**:`dev.w3ctech.docpilot` 建 app 后
  不可改,别在别处改了 applicationId。
- **连不上后端 / 审核崩溃**:生产包连的是 `10.0.2.2` 或内测 LAN IP,重新用 `--api-base 生产域名` 构建。
- **Google 登录 / FCM 在生产包失效**:忘了把 **Play App Signing 的 SHA-256** 登记到 Firebase(不是上传
  密钥的 SHA);到 Play Console 复制正确 SHA 回填。
- **App content 不完整无法发布**:Data safety / 内容分级 / 目标受众 / 隐私政策 URL 有一项没填齐。
- **数据删除项被拒**:删号 Web URL 打不开、需登录才能看、或与 Data safety 声明对不上 → 用步骤③的公开页。
- **新账号无法发布到 Production**:未完成 12×14 天 Closed testing;先补测试再申请生产。

## 铁律

- **自动化只碰本地安全操作(签名 AAB 构建)**;上传轨道 / 商品详情 / Data safety / 内容分级 / 提审
  都是人工在 Play Console 有意识执行,不用脚本写正式记录。
- **生产包必连生产后端**:构建前确认 `--api-base` 是生产 HTTPS 域名——上架最易漏的坑。
- **密钥零入库**:上传密钥库放仓库外,store/key 口令与路径只走环境变量 → Gradle `-P` 注入;
  `app/google-services.json` 与任何 `.jks`/口令**绝不进 git**。
- **只动 `apps/android`(构建/签名)、`apps/web`(隐私/删号页)与 Play Console**;要改 API/契约形状回报,
  不在 Android 侧硬绕(见 android-native 分工)。
- **流程照 [`workflow.md`](../../rules/workflow.md)**:步骤①的代码改动走平级 worktree 起分支 → PR →
  CI 门禁 → 合并后清理分支(`git ls-remote` 验证远端已删)。

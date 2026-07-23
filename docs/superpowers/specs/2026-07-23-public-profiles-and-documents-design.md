# 公开个人主页、关注关系与文档可见性设计

## 背景与目标

DocPilot 当前所有文档能力都位于登录后的 workspace 租户边界内。本次增加公开个人主页、
关注/取消关注，以及文档私有/公开切换，同时不削弱现有的租户隔离保证。

第一版目标：

- 每位用户注册后自动拥有可公开访问的个人主页。
- 主页展示头像、显示名、不可变用户名、简介、地区、网站、社交链接、关注/粉丝数量与公开文档。
- 关注与粉丝列表公开可浏览；登录用户可以幂等地关注或取消关注其他用户。
- 文档默认私有，所有者可以公开处于可阅读状态的文档。
- 匿名访客只能查看公开文档详情与 PDF，不可查看摘要或发起 AI 问答。

明确不做：

- 关注或新文档通知。
- 主页、关注列表的隐私开关。
- 公开文档摘要、公开问答、匿名 AI 能力。
- 阻止访客保存已展示的 PDF；短期签名 URL 只降低链接长期扩散风险。

## 核心决策

采用“私有写入域 + 独立公开读取域”。现有 tenant-scoped repository 继续只服务认证后的
workspace 操作；匿名读取使用专门的 public repository，并由查询条件和响应白名单共同约束。

不采用以下方案：

- 不给现有文档 repository 增加通用 viewer 上下文。它会让私有与公开语义混入每条查询，
  增加漏掉租户过滤或错误公开私有数据的风险。
- 不建立公开内容投影表。当前规模不值得引入发布同步、补偿和最终一致性成本。

## 数据模型

### `user_profiles`

新增用户资料表：

| 字段 | 约束与语义 |
|---|---|
| `user_id TEXT` | 主键，引用 Better Auth `user.id`，删除用户时级联删除 |
| `username VARCHAR` | 唯一、不可修改的稳定随机用户名 |
| `bio TEXT` | 可空，长度由共享契约限制 |
| `location VARCHAR` | 可空，长度由共享契约限制 |
| `website_url VARCHAR` | 可空，只接受合法 HTTPS URL |
| `social_links JSONB` | 预定义平台到合法 HTTPS URL 的映射 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

头像、显示名继续以 Better Auth `user` 表为事实源，不在 profile 表重复存储。

用户名采用固定前缀加高熵随机串，例如 `dp_k7m4q9x2`。用户名在创建后不可修改；所有公开路由
使用用户名定位用户，内部关联仍使用 `user.id`。迁移为现有用户一次性生成唯一用户名，新用户在
用户初始化流程中与 personal workspace/profile 一并创建。碰撞时重试，数据库唯一约束作为最终保证。

个人主页创建后默认公开，即使没有公开文档也可以访问。

### `user_follows`

新增关注关系表：

| 字段 | 约束与语义 |
|---|---|
| `follower_id TEXT` | 引用 `user.id`，删除用户时级联删除 |
| `following_id TEXT` | 引用 `user.id`，删除用户时级联删除 |
| `created_at` | 关注时间 |

以 `(follower_id, following_id)` 为复合主键，保证重复关注幂等；增加 CHECK 约束禁止自己关注自己。
第一版不在用户表缓存计数，主页查询直接聚合关系表，避免计数漂移。

### `documents.visibility`

`documents` 新增：

```text
visibility VARCHAR NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private', 'public'))
```

历史文档迁移后全部为 `private`，不会因上线而意外公开。只有 `ready` 或 `partially_ready` 文档
可以切换为 `public`。文档进入删除、重新处理或其他不可阅读状态时，必须在同一数据库事务中将
可见性恢复为 `private`，避免旧内容继续公开。

## API 与授权边界

### 无需登录的公开 API

- `GET /public/profiles/:username`
- `GET /public/profiles/:username/documents?cursor=...`
- `GET /public/profiles/:username/followers?cursor=...`
- `GET /public/profiles/:username/following?cursor=...`
- `GET /public/documents/:documentId`
- `GET /public/documents/:documentId/file-url`

公开列表使用稳定 ID 与创建时间组成的游标分页。公开个人资料返回显示名、头像、用户名、简介、
地区、网站、社交链接、关注数、粉丝数和公开文档数。

公开文档 repository 的每一条文档查询都必须在查询本身包含：

```text
visibility = 'public'
AND deleted_at IS NULL
AND status IN ('ready', 'partially_ready')
```

不得先按 ID 取出文档再在业务层判断可见性。公开响应通过显式序列化白名单生成，不返回
`workspace_id`、对象存储 key、处理错误、摘要、chunks、对话、内部 `user.id` 或其他内部字段。

文件地址使用短时效签名 URL。每次签发前重新执行公开条件查询；取消公开后，新页面和 API 请求
立即返回 404，已签发地址最多存活到其短时效结束。

### 需要登录的 API

- `PATCH /me/profile`：更新显示名、头像、简介、地区、网站与社交链接，不接受 username。
- `GET /me/follows/:username`：返回当前用户是否关注目标。
- `PUT /users/:username/follow`：关注目标，重复请求仍成功。
- `DELETE /users/:username/follow`：取消关注，重复请求仍成功。
- `PATCH /documents/:id/visibility`：所有者切换 `private | public`。

关注和资料更新以用户身份授权；文档可见性修改继续经认证 membership 解析 workspace，并走
tenant-scoped document repository。不得信任请求参数中的 workspace ID。

### 错误契约

- 用户名、个人主页或公开文档不存在：`404`。
- 未登录执行关注或写操作：`401`。
- 自我关注：`400 SELF_FOLLOW_NOT_ALLOWED`。
- 不可阅读状态的文档尝试公开：`409 DOCUMENT_NOT_PUBLISHABLE`。
- 非所有者或跨 workspace 修改：沿用现有隔离语义返回 `404/403`。
- 资料字段、URL、平台或长度非法：`400 VALIDATION_ERROR`。

## 后端模块与数据流

新增 `profiles` 模块，按 Route → Service → Repository 分层：

- Route 负责入参解析、认证上下文和白名单序列化。
- Service 编排资料更新、关注/取消关注、自关注门禁与分页。
- Repository 分为本人写入/关系写入和明确命名的公开只读查询，不把公开查询混入 workspace 仓库。

新增 `public-documents` 模块，只负责公开文档元数据和 PDF 地址。它不暴露现有 documents service
中可以读取私有数据的接口，也不开放摘要、检索、对话或 AI Gateway。

现有 `documents` 模块增加可见性变更。删除与重新处理流程在原事务中同步撤销公开状态；本功能
不新增 BullMQ 直发或异步发布动作，现有 Transactional Outbox 不变量保持不变。

## Web 页面与组件

新增页面：

- `/u/[username]`：公开个人主页。
- `/u/[username]/followers`：公开粉丝列表。
- `/u/[username]/following`：公开关注列表。
- `/p/[documentId]`：公开 PDF 阅读页。

扩展现有账户设置，支持编辑显示名、头像、简介、地区、网站和社交链接；显示不可编辑的用户名。
扩展私有文档列表与阅读页，展示公开/私有状态并提供可见性切换入口。

匿名访客可以浏览公开页面。点击关注时跳转登录；登录用户访问自己的主页时不显示关注按钮。

前端遵循既有三层：

- 纯逻辑模块处理资料校验、外链规范化和可见性展示规则。
- 控制器 Hook 管理主页数据、关注状态、分页和 mutation。
- 展示组件只消费 props 并发出回调；页面壳负责状态早返回与编排。

所有样式使用现有墨水纸 token；关注按钮、分页与外链满足键盘操作、焦点可见和可访问名称要求。

## 校验与安全

- `username` 只由服务端生成，客户端不能提交或修改。
- `social_links` 只允许共享契约列出的平台键，所有网站和社交链接均做 URL 解析与 HTTPS 校验。
- 简介、地区、网站和社交链接设置明确长度及数量上限，并由前端、API schema 双层校验。
- 公开接口不根据传入 workspace ID 查询，也不返回 workspace 信息。
- PDF URL 生成仍使用对象存储适配器，不把 bucket 或 object key 暴露给客户端。
- 公开读取接口纳入 IP 维度的轻量限流，关注写入纳入用户维度限流；本期没有匿名 AI 成本。

## 测试策略

按红—绿—重构实施：

1. Schema/纯函数单测：用户名格式、资料 URL、平台白名单、字段上限、文档可发布状态。
2. Repository 集成测试：
   - 私有、删除中或不可读文档永不出现在公开查询。
   - 跨 workspace 不能修改文档可见性。
   - 取消公开后立即不可见。
   - 关注与取消关注分别幂等。
   - 自关注被拒绝。
   - 删除用户级联清理 profile 和关系。
3. Route/Service 测试：匿名公开读取、认证写入、错误码、游标，以及响应不泄露内部字段。
4. Web 纯逻辑测试：资料输入、外链和可见性状态映射。
5. Playwright E2E：
   - 访客访问公开主页和 PDF。
   - 私有文档直链返回 404。
   - 登录用户关注与取消关注。
   - 所有者公开与取消公开文档。
6. 回归门禁：迁移、API/Web lint、typecheck、unit、API integration、build 与相关 E2E。

## 上线与兼容性

数据库迁移顺序：

1. 创建 profile 和 follow 表。
2. 为既有用户生成唯一、不可变的随机用户名及 profile。
3. 给 documents 增加带 `private` 默认值和 CHECK 约束的 visibility。
4. 部署同时支持新 schema 的 API 与 Web。

迁移不会公开历史文档。现有 workspace 文档列表、搜索、问答和 Worker 仍只按原租户边界运行；
公开能力是额外的窄读取面，不改变它们的授权语义。

## 验收标准

- 未登录访客可访问任何已存在用户的公开主页、关注/粉丝列表和公开 PDF。
- 访客无法通过公开 API 获取私有文档、摘要、chunks、问答或内部租户信息。
- 登录用户可幂等关注/取消关注其他用户，不能关注自己。
- 新旧用户都拥有唯一且不可修改的随机用户名。
- 新建和历史文档默认私有；只有可阅读文档可公开。
- 取消公开、删除或重新处理文档后，新请求立即无法公开读取。
- 所有新增数据库查询、API、Web 逻辑和关键用户流程通过对应测试与质量门禁。

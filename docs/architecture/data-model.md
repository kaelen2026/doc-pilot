# 数据模型与存储

## 8. 数据库设计

### 8.1 枚举

建议数据库中使用字符串字段，不使用 PostgreSQL ENUM。原因是字符串加约束更容易迁移。

**document_status**

```
pending_upload
uploaded
queued
processing
ready
partially_ready
failed
deleting
deleted
```

**processing_stage**

```
validate
parse
clean
chunk
embed
summarize
finalize
delete
```

**job_status**

```
pending
running
retrying
completed
failed
cancelled
```

### 8.1.1 认证、Workspace 与 Membership（Phase 2 新增）

**认证表（由 Better Auth 管理）**

用户与会话由 Better Auth 管理，使用其默认单数表名：`user` / `session` / `account` / `verification`。字段与类型以 Better Auth 的 Drizzle schema 为准，**不要手改**。

> ⚠️ 重要：Better Auth 的 `user.id` 是 **TEXT**（非 UUID）。因此所有引用用户的外键（如后文 `documents.owner_id`、`memberships.user_id`、`workspaces.owner_id`）在实现中应为 **TEXT** 引用 `user(id)`，即便后续表格的 SQL 示例写作 `UUID`——以本条为准。

**`user.deletion_scheduled_at`（自定义列,非 Better Auth 字段）**——账户注销的**冷静期**状态。

```sql
ALTER TABLE "user" ADD COLUMN deletion_scheduled_at TIMESTAMP;  -- 可空
CREATE INDEX user_deletion_scheduled_idx
  ON "user"(deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;  -- 部分索引,供 worker 周期扫描
```

- **语义**:`NULL` = 正常账户;非空 = 已请求注销,值为**到期(可硬删除)时刻** = 请求时刻 + `ACCOUNT_DELETION_COOLDOWN_DAYS`(7 天,见 `@doc-pilot/contracts`)。这是我们加的列,Better Auth 不读写它。
- **生命周期**(见 `apps/api/src/modules/me/`、`apps/worker/src/purge-account/`):
  1. **请求**(`POST /me/deletion`):写入到期时刻。幂等——已在冷静期不重置倒计时。
  2. **冻结**:冷静期内账户被 `requireActiveAccount` 中间件挡在所有业务端点外(放行 `/me` 读状态/撤销/退出);前端 `(workspace)` 壳把用户重定向到 `/restore` 恢复页。
  3. **撤销**(`DELETE /me/deletion`):置回 `NULL`,账户即刻恢复。
  4. **到期硬删除**:worker maintenance 队列的周期任务 `purge_account`(仿 Reconciliation)扫 `deletion_scheduled_at <= now`,在**同一事务**里:收集该账户对象 key → **守卫式原子** `DELETE FROM "user" WHERE id=? AND deletion_scheduled_at <= now`(期间被撤销则命中 0 行、跳过——竞态安全落点)→ 把 key 写入 `pending_object_deletions`。删 `user` 行靠 FK 级联清空其全部数据(见下各表 `ON DELETE CASCADE`)。
  5. **对象存储清理**:S3 对象不随 DB 级联,故删库时把待删 objectKey 原子登记到 `pending_object_deletions`(下段),由同一任务的 drain 阶段消费删除——删成功销行,失败累加 `attempts` 留作死信,下轮重试;超过 `OBJECT_PURGE.maxAttempts` 不再重试(供运维排查)。删库与登记原子一致,故崩溃/S3 抖动都不丢 key。
- 硬删除后邮箱唯一约束释放,同邮箱可重新注册为全新账户。

**`pending_object_deletions`(对象存储删除的持久化死信队列)**——见上「对象存储清理」。

```sql
CREATE TABLE pending_object_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  size_bytes BIGINT,
  attempts INTEGER NOT NULL DEFAULT 0,     -- 达 maxAttempts 后不再被 drain 取出(死信)
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pending_object_deletions_scan_idx ON pending_object_deletions(attempts, created_at);
```

无 FK(记录的对象所属 user 已被删除)。`deleteObject` 幂等,故「上轮实删但未销行」的重试再删仍成功→销行。

**device_code**（扫码登录:OAuth 2.0 设备授权流程 RFC 8628,见 ADR-011）

由 Better Auth 的 `deviceAuthorization` 插件读写,经 `/api/auth/device/*` 挂载。字段名（JS 属性）必须与插件声明的 field 名逐字一致（drizzle 适配器按属性名匹配），列名 snake_case。短生命周期（默认 2 分钟即过期），不承载持久业务事实。

```sql
CREATE TABLE device_code (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,      -- 轮询密钥(高熵),web 用它换会话
  user_code TEXT NOT NULL,               -- 展示/编入二维码的短码,iOS 据此批准
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,  -- 批准前为空
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,                  -- pending / approved / denied(VARCHAR + 应用层判定)
  last_polled_at TIMESTAMPTZ,
  polling_interval INTEGER,              -- 毫秒,插件据此触发 slow_down
  client_id TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_code_user_code_idx ON device_code(user_code);
```

批准时插件内部 `createSession(user.id)` 为 web 建**独立**会话(可独立吊销),不与手机共享 session——这是选设备授权流程而非 `oneTimeToken` 的决定性理由(见 ADR-011)。

**push_devices**（APNS 设备令牌注册表，移动端推送）

按**用户身份**键控,**不做 workspace 作用域**——设备属于一个登录用户而非某工作区(与 `device_code` / session 同源:身份级数据不进租户隔离,见 ADR-008)。注册时 `user_id` 一律取自认证用户;平台 admin 发测试推送时按用户查其令牌(经 admin 的跨租户查询路径)。`token` 唯一 → 重复注册走 upsert(幂等),换绑用户即迁移到新 `user_id`。`platform` / `environment` 用 VARCHAR + 应用层校验(合法值见 `@doc-pilot/contracts`,不用 PG ENUM);`environment` 必须与 App 的 `aps-environment` entitlement 一致,否则 APNS 直接 `BadDeviceToken`。APNS 判定失效(410 / `Unregistered` / `BadDeviceToken`)的令牌在发送后即删除。

```sql
CREATE TABLE push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,            -- APNS 设备令牌(十六进制)
  platform VARCHAR(20) NOT NULL,         -- 'ios'(VARCHAR + 应用层校验)
  environment VARCHAR(20) NOT NULL,      -- 'sandbox' / 'production'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- 每次注册刷新,便于清理不活跃令牌
);
CREATE INDEX push_devices_user_idx ON push_devices(user_id);
```

APNS 投递走 token-based JWT(ES256,`.p8`)经 `@doc-pilot/push` 的 HTTP/2 客户端;凭据集中在 `apps/api` 的 `env.ts`(`APNS_*`),未配置则 `/admin/push-test` 返回 503。v1 只有平台 admin 手动测试(`POST /admin/push-test`);文档终态通知扇出到推送是后续工作。

**workspaces**（租户边界，见 ADR-008）

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'personal',
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_owner_id_idx ON workspaces(owner_id);
```

MVP：每个用户注册后自动创建一个 `personal` workspace（Better Auth `user.create.after` 钩子）。

**memberships**（用户 ↔ workspace，MVP 角色仅 `owner`，见 §25）

```sql
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX memberships_user_id_idx ON memberships(user_id);
```

`role` 用 `VARCHAR + CHECK`，不用 PostgreSQL ENUM（与 §8.1 一致）。

### 8.2 documents

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (
    status IN ('pending_upload', 'uploaded', 'queued', 'processing', 'ready',
               'partially_ready', 'failed', 'deleting', 'deleted')
  ),
  visibility VARCHAR(16) NOT NULL DEFAULT 'private', -- private / public
  current_stage VARCHAR(32) CHECK (
    current_stage IS NULL OR current_stage IN (
      'validate', 'parse', 'clean', 'chunk', 'embed', 'summarize', 'finalize', 'delete'
    )
  ),
  progress INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  text_length INTEGER,
  chunk_count INTEGER,
  summary JSONB,
  processing_version INTEGER NOT NULL DEFAULT 1,
  checksum_sha256 VARCHAR(64),
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_workspace_created
ON documents(workspace_id, created_at DESC)
WHERE deleted_at IS NULL;

-- 内容级去重查找（见 rag.md §23.4）：按 (workspace, checksum) 命中已就绪文档。
-- 部分索引:只索引未删且已回填指纹的行。
CREATE INDEX idx_documents_workspace_checksum
ON documents(workspace_id, checksum_sha256)
WHERE deleted_at IS NULL AND checksum_sha256 IS NOT NULL;
```

`summary` 第一版可以使用 JSONB：

```json
{
  "overview": "……",
  "keyPoints": ["……"],
  "topics": ["……"]
}
```

> 实现补充（Phase 3）：`documents` 增加 `idempotency_key VARCHAR(255)` 列，配合
> `UNIQUE(owner_id, idempotency_key)`，用于创建上传的幂等（见 §23.1）。`owner_id`
> 为 TEXT 引用 `user(id)`（见 §8.1.1）。
>
> 实现补充（内容去重）：`documents` 增加 `checksum_sha256 VARCHAR(64)` 列（与
> `document_files.checksum_sha256` 冗余，此处冗余以按 workspace 建索引），由 Worker
> 从真实字节算出后在文档就绪时回填，用于内容级去重（见 rag.md §23.4）。
>
> 实现补充（公开阅读）：`visibility` 使用 `VARCHAR + CHECK`，仅允许 `private` / `public`。
> 新建及历史文档默认私有；只有 `ready` / `partially_ready` 可公开。公开查询必须在 SQL
> 本身同时过滤 visibility、status 与 deleted_at，不得先取行再在业务层判断。

### 8.2.1 公开用户资料与关注关系

`user_profiles` 以 Better Auth `user.id` 为主键，保存不可变的唯一随机 `username`、简介、
地区、HTTPS 网站和受平台白名单约束的社交链接。显示名与头像仍以 `user` 表为事实源。

`user_follows` 以 `(follower_id, following_id)` 为复合主键，两列均引用 `user.id` 并级联
删除；CHECK 约束禁止自己关注自己。第一版关注/粉丝数实时聚合，不保存易漂移的冗余计数。

### 8.3 document_files

```sql
CREATE TABLE document_files (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  kind VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64),
  content_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(provider, bucket, object_key)
);
```

`kind`：`original`、`extracted_text`、`thumbnail`、`page_image`。

### 8.4 document_chunks

```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  processing_version INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  token_count INTEGER NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  section_path JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(1024),  -- 默认模型 bge-m3(本地 Ollama / OpenAI 兼容端点)原生 1024 维;换模型改维度须同步 migration 并递增 embedding_version
  embedding_model VARCHAR(100),
  embedding_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(document_id, processing_version, chunk_index)
);
```

保留 `workspace_id` 是为了向量检索时直接执行租户过滤。

向量索引：

```sql
CREATE INDEX idx_chunks_embedding_hnsw
ON document_chunks
USING hnsw (embedding vector_cosine_ops);
```

MVP 中数据量小，也可以先不创建 HNSW，确认数据规模后增加。

### 8.5 processing_jobs

```sql
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('process_document')),
  stage VARCHAR(32) NOT NULL CHECK (
    stage IN ('validate', 'parse', 'clean', 'chunk', 'embed', 'summarize', 'finalize', 'delete')
  ),
  status VARCHAR(32) NOT NULL CHECK (
    status IN ('pending', 'running', 'retrying', 'completed', 'failed', 'cancelled')
  ),
  idempotency_key VARCHAR(255) NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  payload JSONB NOT NULL,
  result JSONB,
  error_code VARCHAR(100),
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(idempotency_key)
);
```

### 8.6 conversations

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  document_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
```

### 8.7 messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  client_request_id VARCHAR(100),
  parent_message_id UUID,
  generation_id UUID,
  error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(conversation_id, client_request_id)
);
```

- `client_request_id` 记录在 user 消息上;assistant 消息经 `parent_message_id`
  指向它回答的 user 消息。幂等重试(§23.3)靠这条链找到配对回复
  (同一事务成对写入的两条消息 `created_at` 相同,不能按时间配对)。
- `error_code` 保存生成失败原因(`AI_*` 或 `CITATION_VALIDATION_FAILED`),
  支撑 failed → 显式重试的交互。

### 8.8 citations

```sql
CREATE TABLE citations (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  document_id UUID NOT NULL,
  document_chunk_id UUID NOT NULL,
  quote TEXT NOT NULL,
  claim TEXT,
  page_start INTEGER,
  page_end INTEGER,
  score NUMERIC(8, 6),
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
```

### 8.9 ai_generations

```sql
CREATE TABLE ai_generations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID,
  document_id UUID,
  capability VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_id VARCHAR(100),
  prompt_version VARCHAR(50),
  status VARCHAR(30) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cost_micros BIGINT,
  latency_ms INTEGER,
  time_to_first_token_ms INTEGER,
  trace_id VARCHAR(100) NOT NULL,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
```

### outbox_events

> Transactional Outbox 的表设计与用法见 [处理管线 · Transactional Outbox](pipeline.md#11-transactional-outbox)。

## 9. 对象存储设计

### 9.1 Object Key

不要使用用户文件名直接作为 Key。

推荐：

```
workspaces/{workspaceId}/documents/{documentId}/v{version}/original.pdf
```

派生文件：

```
workspaces/{workspaceId}/documents/{documentId}/v{version}/extracted.json
workspaces/{workspaceId}/documents/{documentId}/v{version}/pages/1.png
```

### 9.2 Bucket

第一版一个私有 Bucket 即可：`docpilot-private`。

所有对象禁止公开访问。读取通过：API 代理、临时签名 URL。

### 9.3 上传策略

```
POST /documents
  ↓
创建 pending_upload Document
  ↓
生成 PUT Presigned URL
  ↓
客户端直传
  ↓
POST /documents/:id/complete-upload
```

上传 URL 建议 10～15 分钟过期。

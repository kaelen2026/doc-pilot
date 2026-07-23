# 测试与 Evaluation

## 30. 测试策略

### 30.1 单元测试

覆盖：状态机、Chunk 算法、权限 Policy、配额、Prompt Builder、Citation Validator、错误映射、成本计算。

### 30.2 集成测试

使用真实 PostgreSQL、Redis、MinIO，可以通过 Testcontainers 启动。

覆盖：上传完成事务、Outbox、Job 幂等、向量检索、删除级联、多租户隔离。

CI 在同一套 PostgreSQL 迁移后分别运行 API 与 Worker 集成测试。测试夹具必须用唯一
`runId` 隔离，断言只查询本次夹具的数据，不能依赖整张表初始为空。

### 30.3 AI 测试

Provider 使用 Fake Adapter：

```ts
class FakeAIProvider implements AIProvider {
  // 返回稳定测试结果
}
```

CI 默认不调用真实模型。单独设置可选真实模型 Evaluation Workflow。

### 30.4 E2E

Playwright 完整闭环：

```
登录
  ↓
上传测试 PDF
  ↓
等待 ready
  ↓
查看摘要
  ↓
提出问题
  ↓
验证回答和引用
  ↓
点击引用
  ↓
删除文档
```

### 30.5 iOS

CI 在 `macos-26` 最新可用 iOS runtime 的 iPhone 17 Pro Simulator 上执行 Debug 构建和
`DocPilotTests`，
并显式设置 `CODE_SIGNING_ALLOWED=NO` / `CODE_SIGNING_REQUIRED=NO`，避免依赖签名身份。
需要邮件或生产审核账号的 UI 冒烟仍保留为显式触发的发版前门禁。

### 30.6 覆盖率门禁

覆盖率统计必须包含 API / Worker 的全部 `src/**/*.ts` 业务源码；Web 按前端测试策略统计
`features/` 与 `lib/` 中可单测的非 Hook 逻辑。阈值以全量统计的真实基线起步并逐步提高，
不得通过只挑选高覆盖文件制造虚高总数。数据库 repository 的正确性另由集成测试门禁保障。

## 31. Evaluation 体系

### 31.1 数据集

```
evals/
├── documents/
├── questions.jsonl
└── expected-sources.jsonl
```

样本：

```json
{
  "caseId": "auth-001",
  "document": "auth-design.pdf",
  "question": "为什么系统选择服务端 Session？",
  "expectedPoints": ["支持主动撤销", "便于服务端控制"],
  "expectedPages": [12, 13],
  "shouldAnswer": true
}
```

### 31.2 指标

**检索**：Recall@5、Recall@10、MRR

**回答**：Correctness、Faithfulness、Citation Accuracy、Answer Relevance、Refusal Accuracy

发布新 Prompt 或新模型前必须跑 Evaluation。

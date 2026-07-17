# Evaluation 数据集

RAG 质量评测的固定数据集(见 `docs/architecture/testing-and-eval.md` §31)。
发布新 Prompt 或换模型前必须跑一轮,对比指标再上线。

## 结构

- `documents/*.jsonl` — 评测语料,**预切片**格式:每行一个 chunk
  `{ "chunkIndex", "content", "pageStart", "pageEnd" }`。
  评测聚焦检索与回答质量,不重测 PDF 解析(解析有自己的单测),
  语料直接以切片形态入库,保证评测输入稳定、可复现。
- `questions.jsonl` — 评测用例:
  `{ "caseId", "document", "question", "expectedPoints", "shouldAnswer" }`。
  `shouldAnswer: false` 的用例期望显式拒答(Refusal Accuracy)。
- `expected-sources.jsonl` — 检索期望:`{ "caseId", "expectedPages" }`,
  按页码断言召回(Recall@5/10、MRR)。

## 运行

```bash
# 检索指标(mock embedding,零网络,CI 可跑)
pnpm --filter @doc-pilot/eval eval

# 全量指标(真实模型:检索 + 回答 + LLM Judge),需要 API Key
EVAL_MODE=full OPENAI_API_KEY=… ANTHROPIC_API_KEY=… pnpm --filter @doc-pilot/eval eval
```

需要 `DATABASE_URL` 指向带 pgvector 的 PostgreSQL(evals 使用独立
workspace,跑完自动清理)。GitHub Actions 里由 `eval.yml` 手动触发
(workflow_dispatch),CI 默认不调用真实模型(§30.3)。

> 注意:retrieval 模式若未配置 `OPENAI_API_KEY`,embedding 走 mock
> 哈希伪向量——此时指标数值**只验证评测链路本身,不代表检索质量**;
> 有意义的指标必须用真实 embedding(配置 Key 后 retrieval / full 均是)。

## 指标口径

- **Recall@k**:top-k 召回 chunk 的页码集合覆盖 `expectedPages` 的比例。
- **MRR**:第一个命中期望页码的候选排名的倒数,按用例平均。
- **Citation Accuracy**:模型引用中通过业务校验(validateAnswer)的比例。
- **Refusal Accuracy**:`shouldAnswer=false` 用例中显式拒答的比例 +
  `shouldAnswer=true` 用例中未误拒的比例。
- **Correctness / Faithfulness / Answer Relevance**:LLM Judge 按
  `expectedPoints` 与检索上下文打 0~5 分(仅 full 模式)。

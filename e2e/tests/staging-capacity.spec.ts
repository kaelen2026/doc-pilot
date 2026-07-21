import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { writePdf } from "../../scripts/staging/generate-pdf.mjs";
import { uploadDocumentViaApi } from "../helpers/api";
import { loginViaOtp } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { compose, containerLogs, sqlJson, withResourceSampler } from "../helpers/staging";
import {
  renderReport,
  resourcePeaks,
  type StagingReport,
  type TierResult,
} from "../helpers/staging-report";

const API_URL = e2eEnv.apiUrl;
const RUN_ID = e2eEnv.staging.runId;
if (!RUN_ID) throw new Error("STAGING_RUN_ID 未设置");
const ROOT = resolve(import.meta.dirname, "../..");
const RUN_DIR = resolve(ROOT, ".artifacts/staging", RUN_ID);
const GENERATED_DIR = resolve(RUN_DIR, "generated");
const SAMPLE_PATH = resolve(RUN_DIR, "samples/container-stats.jsonl");
const QUESTIONS = [
  "How does DocPilot isolate tenant data?",
  "What problem does the transactional outbox solve?",
  "How does DocPilot keep citations trustworthy?",
];

interface DocumentView {
  id: string;
  status: string;
  pageCount: number | null;
  textLength: number | null;
  chunkCount: number | null;
  errorCode: string | null;
}

interface GenerationRow {
  provider: string;
  capability: string;
  costMicros: number;
  latencyMs: number;
  status: string;
}

async function waitForReady(page: Page, documentId: string): Promise<DocumentView> {
  const deadline = Date.now() + 30 * 60_000;
  let latest: DocumentView | undefined;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${API_URL}/documents/${documentId}`);
    if (!response.ok()) throw new Error(`读取文档失败 HTTP ${response.status()}`);
    latest = ((await response.json()) as { document: DocumentView }).document;
    if (latest.status === "ready") return latest;
    if (latest.status === "failed" || latest.status === "partially_ready") {
      throw new Error(`文档 ${documentId} 处理失败:${latest.status}/${latest.errorCode}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  throw new Error(`文档 ${documentId} 等待 ready 超时，最新状态:${latest?.status}`);
}

async function ask(page: Page, conversationId: string, question: string) {
  const result = await page.evaluate(
    async ({ apiUrl, conversation, content }) => {
      const started = performance.now();
      const response = await fetch(`${apiUrl}/conversations/${conversation}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, clientRequestId: crypto.randomUUID() }),
      });
      if (!response.ok || !response.body) throw new Error(`问答请求失败 HTTP ${response.status}`);
      const reader = response.body.getReader();
      let firstByteMs = 0;
      while (true) {
        const { done } = await reader.read();
        if (firstByteMs === 0) firstByteMs = Math.round(performance.now() - started);
        if (done) break;
      }
      return { firstByteMs, totalMs: Math.round(performance.now() - started) };
    },
    { apiUrl: API_URL, conversation: conversationId, content: question },
  );
  const messagesResponse = await page.request.get(
    `${API_URL}/conversations/${conversationId}/messages`,
  );
  if (!messagesResponse.ok()) throw new Error(`读取回答失败 HTTP ${messagesResponse.status()}`);
  const body = (await messagesResponse.json()) as {
    messages: Array<{ role: string; status: string; content: string; citations: unknown[] }>;
  };
  const assistant = [...body.messages].reverse().find((message) => message.role === "assistant");
  if (assistant?.status !== "completed") throw new Error("回答未完成");
  if (assistant.citations.length === 0) throw new Error("真实问答未产生引用");
  if (/占位|mock/i.test(assistant.content)) throw new Error("检测到 Mock/占位回答");
  return { ...result, citationCount: assistant.citations.length, status: assistant.status };
}

function generations(documentId: string): GenerationRow[] {
  return sqlJson<GenerationRow[]>(`select coalesce(json_agg(json_build_object(
    'provider', provider, 'capability', capability, 'costMicros', coalesce(cost_micros,0),
    'latencyMs', latency_ms, 'status', status) order by created_at), '[]'::json)
    from ai_generations where document_id = '${documentId}'`);
}

function totalCost() {
  return sqlJson<number>("select to_json(coalesce(sum(cost_micros),0)) from ai_generations");
}

function hasSummary(documentId: string) {
  return sqlJson<boolean>(
    `select to_json(summary is not null) from documents where id = '${documentId}'`,
  );
}

async function runTier(page: Page, pageCount: number): Promise<TierResult> {
  const path = resolve(GENERATED_DIR, `${pageCount}-pages.pdf`);
  writePdf(path, pageCount);
  const fileBytes = statSync(path).size;
  const started = Date.now();
  const sampled = await withResourceSampler(SAMPLE_PATH, async () => {
    const { documentId } = await uploadDocumentViaApi(page, {
      path,
      filename: `capacity-${pageCount}-pages.pdf`,
    });
    const document = await waitForReady(page, documentId);
    return { documentId, document };
  });
  const readyMs = Date.now() - started;
  const { documentId, document } = sampled.value;
  expect(document.pageCount).toBe(pageCount);
  expect(document.chunkCount).toBeGreaterThan(0);
  expect(hasSummary(documentId)).toBe(true);

  const createConversation = await page.request.post(`${API_URL}/conversations`, {
    data: { documentId, title: `${pageCount} page capacity` },
  });
  if (!createConversation.ok()) throw new Error(`创建会话失败 HTTP ${createConversation.status()}`);
  const conversationId = ((await createConversation.json()) as { conversation: { id: string } })
    .conversation.id;
  const questionResults = [];
  for (const question of QUESTIONS) {
    if (totalCost() >= e2eEnv.staging.costBudgetMicros) throw new Error("AI 成本预算已耗尽");
    questionResults.push({ question, ...(await ask(page, conversationId, question)) });
  }
  const ai = generations(documentId);
  if (ai.length === 0 || ai.some((row) => row.provider === "mock")) {
    throw new Error("检测到缺失或 Mock AI generation");
  }
  const warnings = [];
  if (questionResults.some((question) => question.firstByteMs >= 3000)) {
    warnings.push("问答首字节延迟超过 3 秒目标");
  }
  const peaks = resourcePeaks(sampled.samples);
  if ((peaks.worker?.memoryBytes ?? 0) > 2 * 1024 ** 3) warnings.push("Worker 峰值内存超过 2GB");
  return {
    pageCount,
    fileBytes,
    documentId,
    status: document.status,
    readyMs,
    chunkCount: document.chunkCount ?? 0,
    textLength: document.textLength ?? 0,
    questions: questionResults,
    aiCostMicros: ai.reduce((sum, row) => sum + row.costMicros, 0),
    aiProviders: [...new Set(ai.map((row) => row.provider))],
    resourcePeaks: peaks,
    warnings,
  };
}

test("本机隔离 Staging 真实模型验收与 10/100/500 页容量基准", async ({ page }) => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  const report: StagingReport = {
    schemaVersion: 1,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    completedAt: "",
    outcome: "FAIL",
    costBudgetMicros: e2eEnv.staging.costBudgetMicros,
    totalCostMicros: 0,
    tiers: [],
    warnings: [],
  };
  try {
    await loginViaOtp(page, `staging-${Date.now()}@example.com`);
    if (e2eEnv.staging.resumeRunId) {
      const resumed = JSON.parse(
        readFileSync(
          resolve(ROOT, ".artifacts/staging", e2eEnv.staging.resumeRunId, "report.json"),
          "utf8",
        ),
      ) as StagingReport;
      if (resumed.tiers.length !== 3) throw new Error("恢复报告缺少完整的三档容量结果");
      report.tiers = resumed.tiers;
      report.warnings.push(`复用运行 ${e2eEnv.staging.resumeRunId} 的容量结果`);
    } else {
      for (const pageCount of [10, 100, 500]) {
        report.tiers.push(await runTier(page, pageCount));
      }
    }

    compose(["restart", "api", "worker"]);
    await expect
      .poll(
        async () =>
          fetch(`${API_URL}/health/ready`, { signal: AbortSignal.timeout(10_000) })
            .then((response) => response.status)
            .catch(() => 503),
        { timeout: 60_000 },
      )
      .toBe(200);
    const firstDocumentId = report.tiers[0]?.documentId;
    if (!firstDocumentId) throw new Error("缺少重启后的持久化验证文档");
    const persisted = sqlJson<boolean>(
      `select to_json(exists(select 1 from documents where id = '${firstDocumentId}'))`,
    );
    expect(persisted).toBe(true);
    compose(["run", "--rm", "migrate"]);

    compose(["stop", "redis"]);
    await expect
      .poll(
        async () =>
          fetch(`${API_URL}/health/ready`, { signal: AbortSignal.timeout(10_000) })
            .then((r) => r.status)
            .catch(() => 503),
        { timeout: 60_000 },
      )
      .toBe(503);
    compose(["start", "redis"]);
    await expect
      .poll(async () => (await fetch(`${API_URL}/health/ready`)).status, { timeout: 60_000 })
      .toBe(200);

    report.totalCostMicros = totalCost();
    expect(report.totalCostMicros).toBeLessThanOrEqual(report.costBudgetMicros);
    const outboxFailed = sqlJson<number>(
      "select to_json(count(*)) from outbox_events where status = 'failed'",
    );
    const tierIds = report.tiers.map((tier) => `'${tier.documentId}'`).join(",");
    const jobsFailed = sqlJson<number>(`select to_json(count(*)) from processing_jobs
      where status = 'failed' and document_id in (${tierIds})`);
    expect(outboxFailed).toBe(0);
    expect(jobsFailed).toBe(0);
    report.outcome =
      report.warnings.length > 0 || report.tiers.some((tier) => tier.warnings.length > 0)
        ? "PASS_WITH_WARNINGS"
        : "PASS";
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error);
    try {
      writeFileSync(resolve(RUN_DIR, "worker.log"), containerLogs("worker"));
      writeFileSync(resolve(RUN_DIR, "api.log"), containerLogs("api"));
    } catch {
      report.warnings.push("失败日志采集未完成");
    }
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    try {
      report.totalCostMicros = totalCost();
    } catch {
      report.warnings.push("最终成本采集失败");
    }
    writeFileSync(resolve(RUN_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(resolve(RUN_DIR, "report.md"), renderReport(report));
  }
});

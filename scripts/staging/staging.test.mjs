import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPdf, writePdf } from "./generate-pdf.mjs";
import { buildStagingEnv, serializeEnv } from "./prepare-env.mjs";

test("buildStagingEnv 强制真实文本配置和本机 embedding", () => {
  const env = buildStagingEnv({
    AI_GATEWAY_BASE_URL: "https://gateway.example",
    AI_GATEWAY_API_KEY: "secret",
    AI_ANSWER_MODEL: "answer-model",
    AI_SUMMARIZE_MODEL: "summary-model",
  });
  assert.equal(env.OPENAI_BASE_URL, "http://ollama:11434/v1");
  assert.equal(env.AI_EMBEDDING_MODEL, "bge-m3");
  assert.equal(env.AI_GATEWAY_API_KEY, "secret");
  assert.doesNotMatch(serializeEnv(env), /undefined/);
});

test("buildStagingEnv 缺真实文本凭据时拒绝运行", () => {
  assert.throws(() => buildStagingEnv({}), /真实文本模型/);
});

test("多页 PDF 生成器创建正确 Pages Count", () => {
  const pdf = buildPdf(10).toString("latin1");
  assert.match(pdf, /\/Count 10/);
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 10);
  const dir = mkdtempSync(join(tmpdir(), "docpilot-staging-"));
  try {
    assert.ok(writePdf(join(dir, "500.pdf"), 500) > 100_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

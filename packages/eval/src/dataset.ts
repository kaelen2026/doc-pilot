import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";

/** evals/ 数据集的形状契约(testing-and-eval.md §31.1),加载即校验,坏样本立刻炸出来。 */

const ChunkSchema = z.object({
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  pageStart: z.number().int().min(1),
  pageEnd: z.number().int().min(1),
});
export type EvalChunk = z.infer<typeof ChunkSchema>;

const QuestionSchema = z.object({
  caseId: z.string().min(1),
  document: z.string().min(1),
  question: z.string().min(1),
  expectedPoints: z.array(z.string()),
  shouldAnswer: z.boolean(),
});
export type EvalQuestion = z.infer<typeof QuestionSchema>;

const ExpectedSourcesSchema = z.object({
  caseId: z.string().min(1),
  expectedPages: z.array(z.number().int().min(1)).min(1),
});

export interface EvalCase extends EvalQuestion {
  /** shouldAnswer=false 的用例没有期望页码。 */
  expectedPages: number[];
}

export interface EvalDataset {
  /** 文档名(文件名去扩展)→ 预切片语料。 */
  documents: Map<string, EvalChunk[]>;
  cases: EvalCase[];
}

function parseJsonl<T>(filePath: string, schema: z.ZodType<T>): T[] {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, i) => {
      const parsed = schema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(`${filePath}:${i + 1} 不符合 Schema:${parsed.error.message}`);
      }
      return parsed.data;
    });
}

export function loadDataset(evalsDir: string): EvalDataset {
  const documents = new Map<string, EvalChunk[]>();
  const docsDir = join(evalsDir, "documents");
  for (const file of readdirSync(docsDir).filter((f) => f.endsWith(".jsonl"))) {
    documents.set(basename(file, ".jsonl"), parseJsonl(join(docsDir, file), ChunkSchema));
  }

  const questions = parseJsonl(join(evalsDir, "questions.jsonl"), QuestionSchema);
  const expected = new Map(
    parseJsonl(join(evalsDir, "expected-sources.jsonl"), ExpectedSourcesSchema).map((e) => [
      e.caseId,
      e.expectedPages,
    ]),
  );

  const cases = questions.map((q) => {
    if (!documents.has(q.document)) {
      throw new Error(`用例 ${q.caseId} 引用了不存在的文档 ${q.document}`);
    }
    const expectedPages = expected.get(q.caseId) ?? [];
    if (q.shouldAnswer && expectedPages.length === 0) {
      throw new Error(`用例 ${q.caseId} 应可回答,但 expected-sources.jsonl 缺少期望页码`);
    }
    return { ...q, expectedPages };
  });

  return { documents, cases };
}

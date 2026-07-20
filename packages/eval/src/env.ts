import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalMode } from "./gateway";

// 本包唯一读取 process.env 的地方。
// EVAL_MODE=retrieval(缺省):只算检索指标,embedding 可 mock,CI 可跑。
// EVAL_MODE=full:真实模型跑完整回答链路 + LLM Judge,发布新 Prompt/模型前必须跑。
export const evalEnv = {
  mode: (process.env.EVAL_MODE === "full" ? "full" : "retrieval") as EvalMode,
  // evalsDir 与本文件同在 src/,import.meta.url 定位一致,默认回退到仓库根的 evals/。
  evalsDir:
    process.env.EVALS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../evals"),
  /** 评测报告输出路径;未设置则不落盘。 */
  reportPath: process.env.EVAL_REPORT_PATH,
  ai: {
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? "bge-m3",
    // Judge 与被评模型解耦,缺省同型号;换 judge 模型不影响被评链路。
    answerModel: process.env.AI_ANSWER_MODEL ?? "claude-opus-4-8",
    judgeModel: process.env.AI_JUDGE_MODEL ?? "claude-opus-4-8",
  },
} as const;

import type { ResourceSample } from "./staging";

export interface QuestionResult {
  question: string;
  firstByteMs: number;
  totalMs: number;
  citationCount: number;
  status: string;
}

export interface TierResult {
  pageCount: number;
  fileBytes: number;
  documentId: string;
  status: string;
  readyMs: number;
  chunkCount: number;
  textLength: number;
  questions: QuestionResult[];
  aiCostMicros: number;
  aiProviders: string[];
  resourcePeaks: Record<string, { cpuPercent: number; memoryBytes: number }>;
  warnings: string[];
}

export interface StagingReport {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  completedAt: string;
  outcome: "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
  costBudgetMicros: number;
  totalCostMicros: number;
  tiers: TierResult[];
  warnings: string[];
  failure?: string;
}

export function resourcePeaks(samples: ResourceSample[]) {
  const peaks: Record<string, { cpuPercent: number; memoryBytes: number }> = {};
  for (const sample of samples) {
    const current = peaks[sample.service] ?? { cpuPercent: 0, memoryBytes: 0 };
    current.cpuPercent = Math.max(current.cpuPercent, sample.cpuPercent);
    current.memoryBytes = Math.max(current.memoryBytes, sample.memoryBytes);
    peaks[sample.service] = current;
  }
  return peaks;
}

function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function mib(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function renderReport(report: StagingReport): string {
  const lines = [
    "# DocPilot 本机隔离 Staging 验收报告",
    "",
    `- 运行 ID：\`${report.runId}\``,
    `- 结果：**${report.outcome}**`,
    `- 时间：${report.startedAt} → ${report.completedAt}`,
    `- Gateway 估算成本：${dollars(report.totalCostMicros)} / ${dollars(report.costBudgetMicros)}`,
    "",
    "## 容量分档",
    "",
    "| 页数 | 文件 | Ready 耗时 | Chunks | 文本长度 | AI 成本 | Provider |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const tier of report.tiers) {
    lines.push(
      `| ${tier.pageCount} | ${mib(tier.fileBytes)} | ${(tier.readyMs / 1000).toFixed(1)}s | ${tier.chunkCount} | ${tier.textLength} | ${dollars(tier.aiCostMicros)} | ${tier.aiProviders.join(", ")} |`,
    );
  }
  lines.push("", "## 问答", "");
  for (const tier of report.tiers) {
    lines.push(`### ${tier.pageCount} 页`, "");
    for (const question of tier.questions) {
      lines.push(
        `- ${question.question}：首字节 ${question.firstByteMs}ms，总计 ${question.totalMs}ms，引用 ${question.citationCount}。`,
      );
    }
    const resources = Object.entries(tier.resourcePeaks)
      .map(
        ([service, peak]) => `${service} ${peak.cpuPercent.toFixed(1)}% / ${mib(peak.memoryBytes)}`,
      )
      .join("；");
    lines.push("", `资源峰值：${resources || "无样本"}`, "");
  }
  const warnings = [...report.warnings, ...report.tiers.flatMap((tier) => tier.warnings)];
  if (warnings.length > 0) {
    lines.push("## 警告", "", ...warnings.map((warning) => `- ${warning}`), "");
  }
  if (report.failure) lines.push("## 失败", "", report.failure, "");
  return `${lines.join("\n")}\n`;
}

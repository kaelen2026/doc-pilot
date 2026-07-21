import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { e2eEnv } from "./env";

const ROOT = resolve(import.meta.dirname, "../..");
const PROJECT = "docpilot-staging-local";
const BASE = resolve(ROOT, "docker-compose.prod.yml");
const OVERLAY = resolve(ROOT, "docker-compose.staging.yml");
const ENV_FILE = resolve(ROOT, ".env.production");

function composeArgs(args: string[]) {
  return [
    "compose",
    "--project-name",
    PROJECT,
    "--env-file",
    ENV_FILE,
    "-f",
    BASE,
    "-f",
    OVERLAY,
    ...args,
  ];
}

export function compose(args: string[]): string {
  return execFileSync("docker", composeArgs(args), { cwd: ROOT, encoding: "utf8" });
}

export function sqlJson<T>(sql: string): T {
  const user = e2eEnv.staging.postgresUser;
  const database = e2eEnv.staging.postgresDatabase;
  if (!user || !database) throw new Error("缺少 Staging PostgreSQL 测试配置");
  const output = execFileSync(
    "docker",
    composeArgs(["exec", "-T", "postgres", "psql", "-U", user, "-d", database, "-Atqc", sql]),
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  return JSON.parse(output || "null") as T;
}

function parseBytes(value: string): number {
  const match = value.trim().match(/^([\d.]+)([KMGT]?i?B)$/i);
  if (!match) return 0;
  const unit = match[2]?.toUpperCase();
  const powers: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1e6,
    MIB: 1024 ** 2,
    GB: 1e9,
    GIB: 1024 ** 3,
    TB: 1e12,
    TIB: 1024 ** 4,
  };
  return Number(match[1]) * (powers[unit ?? "B"] ?? 1);
}

export interface ResourceSample {
  at: string;
  service: string;
  cpuPercent: number;
  memoryBytes: number;
}

export function sampleResources(outputPath: string): ResourceSample[] {
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  const services = ["api", "worker", "ollama", "postgres"];
  const samples: ResourceSample[] = [];
  const ids = execFileSync("docker", composeArgs(["ps", "-q", ...services]), {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (ids.length === 0) return samples;

  const serviceById = new Map<string, string>();
  for (const service of services) {
    const id = execFileSync("docker", composeArgs(["ps", "-q", service]), {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (id) serviceById.set(id, service);
  }
  const raw = execFileSync("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...ids], {
    encoding: "utf8",
  }).trim();
  for (const line of raw.split("\n").filter(Boolean)) {
    const stat = JSON.parse(line) as { ID: string; CPUPerc: string; MemUsage: string };
    const service = [...serviceById.entries()].find(([id]) => id.startsWith(stat.ID))?.[1];
    if (!service) continue;
    samples.push({
      at: new Date().toISOString(),
      service,
      cpuPercent: Number.parseFloat(stat.CPUPerc) || 0,
      memoryBytes: parseBytes(stat.MemUsage.split("/")[0] ?? "0B"),
    });
  }
  if (samples.length > 0) {
    appendFileSync(outputPath, `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`);
  }
  return samples;
}

export async function withResourceSampler<T>(path: string, task: () => Promise<T>) {
  const all: ResourceSample[] = [];
  const collect = () => {
    try {
      all.push(...sampleResources(path));
    } catch {
      // 采样失败由报告 warnings 呈现，不中断主验收。
    }
  };
  collect();
  const timer = setInterval(collect, 5000);
  try {
    return { value: await task(), samples: all };
  } finally {
    clearInterval(timer);
    collect();
  }
}

export function containerLogs(service: string, tail = 300): string {
  return execFileSync(
    "docker",
    composeArgs(["logs", "--no-color", "--tail", String(tail), service]),
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
}

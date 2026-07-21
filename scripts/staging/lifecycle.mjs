import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { API_URL, COMPOSE_ARGS, GENERATED_ENV, PROJECT_NAME, ROOT, WEB_URL } from "./constants.mjs";

function docker(args, options = {}) {
  return spawnSync("docker", [...COMPOSE_ARGS, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function requireEnv() {
  if (!existsSync(GENERATED_ENV)) {
    const result = spawnSync(process.execPath, ["scripts/staging/prepare-env.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      last = `HTTP ${response.status}`;
      if (response.ok) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`等待 ${url} 超时:${last}`);
}

function diagnostics() {
  docker(["ps"]);
  docker(["logs", "--tail", "120", "api", "worker", "migrate"]);
}

async function up() {
  requireEnv();
  const result = docker(["up", "-d", "--build"]);
  if (result.status !== 0) process.exit(result.status ?? 1);
  try {
    await waitFor(`${API_URL}/health`, 10 * 60_000);
    await waitFor(`${API_URL}/health/ready`, 10 * 60_000);
    await waitFor(WEB_URL, 5 * 60_000);
    const logs = docker(["logs", "worker"], { capture: true });
    if (!logs.stdout?.includes('"event":"worker.started"')) {
      throw new Error("Worker 未输出 worker.started");
    }
    console.log("本机隔离 Staging 已就绪");
  } catch (error) {
    diagnostics();
    throw error;
  }
}

async function status() {
  requireEnv();
  docker(["ps"]);
  const checks = [`${API_URL}/health`, `${API_URL}/health/ready`, WEB_URL];
  for (const url of checks) {
    try {
      const response = await fetch(url);
      console.log(`${response.ok ? "OK" : "FAIL"} ${url} HTTP ${response.status}`);
    } catch (error) {
      console.log(`FAIL ${url} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function assertProject() {
  if (PROJECT_NAME !== "docpilot-staging-local") {
    throw new Error(`拒绝清理未知 Compose project:${PROJECT_NAME}`);
  }
}

const command = process.argv[2] ?? "status";
if (command === "config") {
  requireEnv();
  process.exit(docker(["config", "--quiet"]).status ?? 1);
} else if (command === "up") {
  await up();
} else if (command === "status") {
  await status();
} else if (command === "down" || command === "purge") {
  assertProject();
  requireEnv();
  const args = ["down", "--remove-orphans"];
  if (command === "purge") args.push("--volumes");
  process.exit(docker(args).status ?? 1);
} else if (command === "logs") {
  requireEnv();
  process.exit(docker(["logs", "--tail", "200"]).status ?? 1);
} else {
  console.error(`未知命令:${command}`);
  process.exit(2);
}

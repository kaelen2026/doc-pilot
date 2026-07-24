import { afterEach, describe, expect, it } from "vitest";
import { startMetrics, type TelemetryHandle } from "./telemetry";

// 每个用例随机高位端口,避免与本机/CI 已占用端口冲突。
function randomPort(): number {
  return 19_000 + Math.floor(Math.random() * 10_000);
}

let handle: TelemetryHandle | null = null;
const originalMetricsPort = process.env.METRICS_PORT;

afterEach(async () => {
  await handle?.shutdown();
  handle = null;
  if (originalMetricsPort === undefined) {
    delete process.env.METRICS_PORT;
  } else {
    process.env.METRICS_PORT = originalMetricsPort;
  }
});

describe("startMetrics", () => {
  it("opts.port 与 METRICS_PORT 都缺省时不启动并返回 null", () => {
    delete process.env.METRICS_PORT;
    expect(startMetrics({ serviceName: "test" })).toBeNull();
  });

  it("显式传入端口时启动 Prometheus /metrics 端点", async () => {
    const port = randomPort();
    handle = startMetrics({ serviceName: "test", port });

    expect(handle).not.toBeNull();
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("# ");
  });

  it("opts.port 缺省时从 METRICS_PORT 读取端口", async () => {
    const port = randomPort();
    process.env.METRICS_PORT = String(port);
    handle = startMetrics({ serviceName: "test" });

    expect(handle).not.toBeNull();
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
  });

  it("shutdown 后 /metrics 端点关闭", async () => {
    const port = randomPort();
    handle = startMetrics({ serviceName: "test", port });
    expect(handle).not.toBeNull();

    await handle?.shutdown();
    handle = null;
    await expect(fetch(`http://127.0.0.1:${port}/metrics`)).rejects.toThrow();
  });
});

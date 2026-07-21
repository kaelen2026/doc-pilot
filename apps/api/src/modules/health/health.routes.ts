import { Hono } from "hono";

export interface ReadinessProbes {
  database(): Promise<void>;
  redis(): Promise<void>;
  storage(): Promise<void>;
}

const noopProbes: ReadinessProbes = {
  database: async () => {},
  redis: async () => {},
  storage: async () => {},
};

/** `/` 是 liveness；`/ready` 检查承载请求所需的基础依赖。 */
export function createHealthRoutes(probes: ReadinessProbes = noopProbes) {
  const app = new Hono();
  app.get("/", (c) => c.json({ status: "ok", service: "api", time: new Date().toISOString() }));
  app.get("/ready", async (c) => {
    const entries = Object.entries(probes) as Array<
      [keyof ReadinessProbes, ReadinessProbes[keyof ReadinessProbes]]
    >;
    const results = await Promise.allSettled(entries.map(([, probe]) => probe()));
    const checks = Object.fromEntries(
      entries.map(([name], index) => [
        name,
        results[index]?.status === "fulfilled" ? "ok" : "failed",
      ]),
    );
    const ready = results.every((result) => result.status === "fulfilled");
    return c.json({ status: ready ? "ready" : "not_ready", checks }, ready ? 200 : 503);
  });
  return app;
}

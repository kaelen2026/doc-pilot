import * as contracts from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import * as queuePackage from "./index";
import { InMemoryNotificationBus, RedisNotificationBus } from "./notification-bus";
import { buildParseBullJobId } from "./queues";

// index.ts 是 worker/api 的一处导入面;这里钉住「透传不漂移」:
// 重导出必须与源定义同一引用,否则消费方拿到的可能是本地重复定义的旧副本。
describe("包导出面", () => {
  it("contracts 的幂等键与常量按原引用透传", () => {
    expect(queuePackage.buildParseJobId).toBe(contracts.buildParseJobId);
    expect(queuePackage.QUEUE_NAMES).toBe(contracts.QUEUE_NAMES);
    expect(queuePackage.JOB_NAMES).toBe(contracts.JOB_NAMES);
    expect(queuePackage.PROCESSING_RETRY).toBe(contracts.PROCESSING_RETRY);
  });

  it("队列与通知总线实现按原引用透传", () => {
    expect(queuePackage.buildParseBullJobId).toBe(buildParseBullJobId);
    expect(queuePackage.InMemoryNotificationBus).toBe(InMemoryNotificationBus);
    expect(queuePackage.RedisNotificationBus).toBe(RedisNotificationBus);
    expect(typeof queuePackage.createRedisConnection).toBe("function");
    expect(typeof queuePackage.getDocumentProcessingQueue).toBe("function");
    expect(typeof queuePackage.getMaintenanceQueue).toBe("function");
  });
});

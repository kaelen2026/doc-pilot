import { describe, expect, it } from "vitest";
// 故意经 barrel 导入:钉住「包根导出即完整契约面」,同时覆盖 index.ts 的 re-export。
import { CHAT_SSE_EVENTS, NOTIFICATION_SSE_EVENTS } from "./index";

describe("契约包 barrel", () => {
  it("chat 与 notification 的 SSE 事件名全局互不冲突(客户端按事件名分发,撞名即错路由)", () => {
    const all = [...Object.values(CHAT_SSE_EVENTS), ...Object.values(NOTIFICATION_SSE_EVENTS)];
    expect(new Set(all).size).toBe(all.length);
  });
});

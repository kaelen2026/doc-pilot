import { describe, expect, it } from "vitest";
import { buildAlertPayload } from "./payload";

describe("buildAlertPayload", () => {
  it("只有标题时:alert 只含 title,声音默认为 default", () => {
    const p = buildAlertPayload({ title: "标题" });
    expect(p.aps.alert).toEqual({ title: "标题" });
    expect(p.aps.sound).toBe("default");
  });

  it("带正文时:alert 同时含 title 与 body", () => {
    const p = buildAlertPayload({ title: "标题", body: "正文" });
    expect(p.aps.alert).toEqual({ title: "标题", body: "正文" });
  });

  it("显式 badge / sound 覆盖默认", () => {
    const p = buildAlertPayload({ title: "t", badge: 3, sound: "ping.aiff" });
    expect(p.aps.badge).toBe(3);
    expect(p.aps.sound).toBe("ping.aiff");
  });

  it("自定义 data 作为 aps 的同级兄弟键,且不能覆盖 aps", () => {
    const p = buildAlertPayload({
      title: "t",
      data: { type: "document.ready", resourceId: "doc-1", aps: "hijack" },
    });
    expect(p.type).toBe("document.ready");
    expect(p.resourceId).toBe("doc-1");
    // 保留键 aps 不被 data 里的同名键篡改。
    expect(typeof p.aps).toBe("object");
    expect(p.aps.alert).toEqual({ title: "t" });
  });
});

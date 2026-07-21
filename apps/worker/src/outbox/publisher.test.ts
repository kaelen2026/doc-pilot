import { describe, expect, it } from "vitest";
import { parseOutboxEvent } from "./publisher";

describe("parseOutboxEvent", () => {
  const payload = {
    documentId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    processingVersion: 1,
  };

  it("接受已知事件和合法 payload", () => {
    expect(parseOutboxEvent("document.processing.requested", payload)).toEqual({
      ok: true,
      payload,
    });
  });

  it("拒绝未知事件，避免静默 published", () => {
    expect(parseOutboxEvent("document.unknown", payload)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("未知"),
    });
  });

  it("拒绝非法 payload", () => {
    expect(
      parseOutboxEvent("document.processing.requested", { ...payload, processingVersion: 0 }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("payload") });
  });
});

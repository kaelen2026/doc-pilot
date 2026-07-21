import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAT_SSE_EVENTS } from "./chat";
import { DOCUMENT_STATUS } from "./documents";

const fixtureUrl = (name: string) => new URL(`../fixtures/apple/${name}`, import.meta.url);

const readJson = async (name: string) =>
  JSON.parse(await readFile(fileURLToPath(fixtureUrl(name)), "utf8"));

describe("Apple 客户端契约夹具", () => {
  it("文档列表只使用共享状态枚举", async () => {
    const fixture = await readJson("documents/list.json");

    for (const document of fixture.documents) {
      expect(DOCUMENT_STATUS).toContain(document.status);
    }
  });

  it("SSE 流只使用共享事件名且不包含真实凭据", async () => {
    const raw = await readFile(fileURLToPath(fixtureUrl("chat/stream.jsonl")), "utf8");
    const events = raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    for (const event of events) {
      expect(Object.values(CHAT_SSE_EVENTS)).toContain(event.event);
    }
    expect(raw).not.toMatch(/Bearer |sk-|secret|password/i);
  });

  it("会话夹具不固化 bearer token", async () => {
    const fixture = await readJson("auth/session.json");

    expect(fixture.session).not.toHaveProperty("token");
  });
});

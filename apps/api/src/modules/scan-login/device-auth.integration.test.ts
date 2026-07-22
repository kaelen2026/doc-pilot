import { DEVICE_GRANT_TYPE, SCAN_LOGIN_CLIENT_ID, SCAN_LOGIN_URI } from "@doc-pilot/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * 扫码登录后端(Better Auth device-authorization 插件,经 /api/auth/device/* 自动挂载)集成测。
 * 需真实 Postgres(device_code 表已迁移)。钉住我们这侧的接线不变量:
 * - 首方 client_id 才能取码,任意 client_id 被 validateClient 拒绝(invalid_client)。
 * - 取码返回 docpilot:// 深链形态的 verification_uri_complete(供 iOS 扫码解析)。
 * - 未批准的设备码轮询返回 RFC 8628 的 authorization_pending。
 * 完整 approve→session 快乐路径由 iOS 端 E2E / 手动 QA 覆盖(需已登录会话)。
 */
const app = createApp();

async function deviceCode(clientId: string) {
  const res = await app.request("/api/auth/device/code", {
    method: "POST",
    headers: { "content-type": "application/json", origin: SCAN_LOGIN_URI },
    body: JSON.stringify({ client_id: clientId }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

let issuedDeviceCode = "";

beforeAll(async () => {
  const { status, body } = await deviceCode(SCAN_LOGIN_CLIENT_ID);
  expect(status).toBe(200);
  issuedDeviceCode = body.device_code as string;
});

afterAll(async () => {
  const { db, queryClient } = await import("@doc-pilot/database");
  const { deviceCode: deviceCodeTable } = await import("@doc-pilot/database/schema");
  const { eq } = await import("drizzle-orm");
  if (issuedDeviceCode) {
    await db.delete(deviceCodeTable).where(eq(deviceCodeTable.deviceCode, issuedDeviceCode));
  }
  await queryClient.end({ timeout: 5 });
});

describe("POST /api/auth/device/code", () => {
  it("首方 client 取码:返回 device_code / user_code / docpilot 深链 / interval", async () => {
    const { status, body } = await deviceCode(SCAN_LOGIN_CLIENT_ID);
    expect(status).toBe(200);
    expect(typeof body.device_code).toBe("string");
    expect(typeof body.user_code).toBe("string");
    expect(body.verification_uri).toBe(SCAN_LOGIN_URI);
    expect(String(body.verification_uri_complete)).toContain(`${SCAN_LOGIN_URI}?user_code=`);
    // expiresIn "2m" → 120s;interval "2s" → 2s。
    expect(body.expires_in).toBe(120);
    expect(body.interval).toBe(2);

    const { db, queryClient } = await import("@doc-pilot/database");
    const { deviceCode: t } = await import("@doc-pilot/database/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(t).where(eq(t.deviceCode, body.device_code as string));
    void queryClient;
  });

  it("非首方 client_id 被 validateClient 拒绝(invalid_client)", async () => {
    const { status, body } = await deviceCode("some-evil-client");
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_client");
  });
});

describe("POST /api/auth/device/token", () => {
  it("未批准的设备码轮询返回 authorization_pending", async () => {
    const res = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json", origin: SCAN_LOGIN_URI },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: issuedDeviceCode,
        client_id: SCAN_LOGIN_CLIENT_ID,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("authorization_pending");
  });
});

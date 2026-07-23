import { verify as cryptoVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApnsTokenSource, signApnsJwt } from "./jwt";

/** 生成一把 P-256 EC 私钥(PKCS#8 PEM,与 Apple .p8 同格式)+ 对应公钥,用于验签。 */
function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey,
  };
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

/** 拆出 JWT 的三段;noUncheckedIndexedAccess 下把结果收窄为确定的三元组。 */
function segments(jwt: string): [string, string, string] {
  const parts = jwt.split(".");
  expect(parts).toHaveLength(3);
  return parts as [string, string, string];
}

describe("signApnsJwt", () => {
  it("头部为 ES256 + kid,声明含 iss(teamId)与 iat", () => {
    const { privateKeyPem } = makeKeyPair();
    const jwt = signApnsJwt({
      teamId: "TEAM123",
      keyId: "KEY456",
      privateKey: privateKeyPem,
      issuedAt: 1_700_000_000,
    });
    const [h, c, s] = segments(jwt);
    expect(s).toBeTruthy();
    expect(decodeSegment(h)).toEqual({ alg: "ES256", kid: "KEY456" });
    expect(decodeSegment(c)).toEqual({ iss: "TEAM123", iat: 1_700_000_000 });
  });

  it("签名可被对应公钥验证(ES256 / IEEE-P1363 编码)", () => {
    const { privateKeyPem, publicKey } = makeKeyPair();
    const jwt = signApnsJwt({
      teamId: "T",
      keyId: "K",
      privateKey: privateKeyPem,
      issuedAt: 1_700_000_000,
    });
    const [h, c, s] = segments(jwt);
    const ok = cryptoVerify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    );
    expect(ok).toBe(true);
  });
});

describe("createApnsTokenSource", () => {
  it("TTL 内复用同一令牌,超过 TTL 后重新签发", () => {
    const { privateKeyPem } = makeKeyPair();
    let now = 1_000_000;
    const src = createApnsTokenSource({
      teamId: "T",
      keyId: "K",
      privateKey: privateKeyPem,
      ttlMs: 60_000,
      now: () => now,
    });
    const first = src.token();
    now += 30_000;
    expect(src.token()).toBe(first); // 仍在 TTL 内
    now += 40_000; // 累计 70s > 60s TTL
    const third = src.token();
    expect(third).not.toBe(first);
    // 新令牌的 iat 反映新的签发时刻。
    const iat = (decodeSegment(segments(third)[1]) as { iat: number }).iat;
    expect(iat).toBe(Math.floor((1_000_000 + 70_000) / 1000));
  });
});

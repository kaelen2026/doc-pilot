import { sign as cryptoSign } from "node:crypto";
import type { ApnsTokenSource } from "./types";

/** Apple 建议 provider JWT 有效期 ≤ 60 分钟且刷新不快于 20 分钟;取 50 分钟折中。 */
const DEFAULT_TTL_MS = 50 * 60 * 1000;

function base64url(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input) : input).toString("base64url");
}

export interface SignApnsJwtInput {
  /** Apple Developer Team ID(JWT 的 iss)。 */
  teamId: string;
  /** APNS Auth Key 的 Key ID(JWT 头 kid)。 */
  keyId: string;
  /** .p8 私钥内容(PKCS#8 PEM,含 BEGIN PRIVATE KEY 头尾)。 */
  privateKey: string;
  /** 签发时刻(Unix 秒)。 */
  issuedAt: number;
}

/**
 * 签发一枚 APNS provider JWT(ES256)。ECDSA 签名用 IEEE-P1363(r‖s)编码——JWS 规范要求,
 * 而非 node 默认的 DER。签名含随机数,故同一输入每次输出不同(靠公钥验签,而非比字符串)。
 */
export function signApnsJwt(input: SignApnsJwtInput): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: input.keyId }));
  const claims = base64url(JSON.stringify({ iss: input.teamId, iat: input.issuedAt }));
  const signingInput = `${header}.${claims}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: input.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export interface CreateApnsTokenSourceInput {
  teamId: string;
  keyId: string;
  privateKey: string;
  /** 令牌 TTL(ms),缺省 50 分钟。 */
  ttlMs?: number;
  /** 当前时刻(ms),可注入以便测试;缺省 Date.now。 */
  now?: () => number;
}

/**
 * 带缓存的令牌来源:TTL 内复用同一 JWT,过期后按当前时刻重新签发。
 * 避免每次投递都做一次 ECDSA 签名,也满足 Apple「勿过频刷新」的约束。
 */
export function createApnsTokenSource(input: CreateApnsTokenSourceInput): ApnsTokenSource {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const now = input.now ?? Date.now;
  let cached: { token: string; issuedAtMs: number } | undefined;

  return {
    token() {
      const nowMs = now();
      if (cached && nowMs - cached.issuedAtMs < ttlMs) {
        return cached.token;
      }
      const token = signApnsJwt({
        teamId: input.teamId,
        keyId: input.keyId,
        privateKey: input.privateKey,
        issuedAt: Math.floor(nowMs / 1000),
      });
      cached = { token, issuedAtMs: nowMs };
      return token;
    },
  };
}

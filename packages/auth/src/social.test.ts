import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { resolveSocialProviders } from "./social";

// 测试用 EC P-256 PKCS8 私钥(一次性生成,仅供单测验证 client secret 签发,无任何真实用途)。
const TEST_P8 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQghSvZBgMDjy60wl8E
arlVTQAPQHMnKqM46uFlX1MlxFGhRANCAAQJqLo2WP2n7VcTHngigONxD2O8DDCk
71rCQxAvifzi3KUw+9+0EEs+Fprd4+568imWZk0o9nQQD6i84ft1f9NO
-----END PRIVATE KEY-----`;

const noApple = {
  clientId: "",
  teamId: "",
  keyId: "",
  privateKey: "",
  appBundleIdentifier: "",
} as const;

const fullApple = {
  clientId: "com.example.service",
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: TEST_P8,
  appBundleIdentifier: "dev.w3ctech.docpilot",
} as const;

describe("resolveSocialProviders", () => {
  it("clientId 与 secret 齐备、未配 iOS client 时,google.clientId 为单串", () => {
    const providers = resolveSocialProviders({
      google: { clientId: "gid", clientSecret: "gsecret", iosClientId: "" },
      apple: noApple,
    });

    expect(providers.google).toEqual({ clientId: "gid", clientSecret: "gsecret" });
  });

  it("配了 iOS client ID 时,google.clientId 为 [web, ios] 数组——供原生 idToken 的 aud 校验", () => {
    const providers = resolveSocialProviders({
      google: {
        clientId: "gid",
        clientSecret: "gsecret",
        iosClientId: "ios.apps.googleusercontent.com",
      },
      apple: noApple,
    });

    // better-auth google 的 clientId 接受 string[],作为 verifyIdToken 的 audience 列表;
    // 首项(web)仍是 web OAuth 流程的 primary client id。
    expect(providers.google).toEqual({
      clientId: ["gid", "ios.apps.googleusercontent.com"],
      clientSecret: "gsecret",
    });
  });

  it("凭据缺失(空串)时不注册,返回空对象——避免装配出必然报错的 provider", () => {
    expect(
      resolveSocialProviders({
        google: { clientId: "", clientSecret: "", iosClientId: "" },
        apple: noApple,
      }),
    ).toEqual({});
    expect(
      resolveSocialProviders({
        google: { clientId: "gid", clientSecret: "", iosClientId: "" },
        apple: noApple,
      }),
    ).toEqual({});
    expect(
      resolveSocialProviders({
        google: { clientId: "", clientSecret: "gsecret", iosClientId: "" },
        apple: noApple,
      }),
    ).toEqual({});
  });

  it("Apple 凭据齐备时注册,provider 为动态签发 client secret 的工厂函数", async () => {
    const providers = resolveSocialProviders({
      google: { clientId: "", clientSecret: "", iosClientId: "" },
      apple: fullApple,
    });

    expect(typeof providers.apple).toBe("function");

    // 调用工厂:client secret 应是 ES256 JWT,声明与 Apple 要求一致;并回传 appBundleIdentifier。
    const resolved = await (providers.apple as unknown as () => Promise<Record<string, unknown>>)();
    expect(resolved.clientId).toBe(fullApple.clientId);
    expect(resolved.appBundleIdentifier).toBe(fullApple.appBundleIdentifier);

    const secret = resolved.clientSecret as string;
    expect(decodeProtectedHeader(secret)).toMatchObject({ alg: "ES256", kid: fullApple.keyId });
    expect(decodeJwt(secret)).toMatchObject({
      iss: fullApple.teamId,
      sub: fullApple.clientId,
      aud: "https://appleid.apple.com",
    });
  });

  it("Apple 私钥缺失时不注册——生成 client secret 必须有私钥", () => {
    const providers = resolveSocialProviders({
      google: { clientId: "", clientSecret: "", iosClientId: "" },
      apple: { ...fullApple, privateKey: "" },
    });

    expect(providers.apple).toBeUndefined();
  });

  it("Apple 齐备但未配 appBundleIdentifier 时仍注册,只是省略该字段", async () => {
    const providers = resolveSocialProviders({
      google: { clientId: "", clientSecret: "", iosClientId: "" },
      apple: { ...fullApple, appBundleIdentifier: "" },
    });

    const resolved = await (providers.apple as unknown as () => Promise<Record<string, unknown>>)();
    expect(resolved).not.toHaveProperty("appBundleIdentifier");
    expect(resolved.clientId).toBe(fullApple.clientId);
  });
});

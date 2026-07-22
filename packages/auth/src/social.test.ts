import { describe, expect, it } from "vitest";
import { resolveSocialProviders } from "./social";

describe("resolveSocialProviders", () => {
  it("clientId 与 secret 齐备时注册 Google", () => {
    const providers = resolveSocialProviders({
      google: { clientId: "gid", clientSecret: "gsecret" },
    });

    expect(providers).toEqual({ google: { clientId: "gid", clientSecret: "gsecret" } });
  });

  it("凭据缺失(空串)时不注册,返回空对象——避免装配出必然报错的 provider", () => {
    expect(resolveSocialProviders({ google: { clientId: "", clientSecret: "" } })).toEqual({});
    expect(resolveSocialProviders({ google: { clientId: "gid", clientSecret: "" } })).toEqual({});
    expect(resolveSocialProviders({ google: { clientId: "", clientSecret: "gsecret" } })).toEqual(
      {},
    );
  });
});

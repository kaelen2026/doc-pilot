import type { BetterAuthOptions } from "better-auth";
import { importPKCS8, SignJWT } from "jose";

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

/**
 * 用 jose 从 Apple 凭据动态生成「Sign in with Apple」所需的 client secret(ES256 JWT)。
 * iss=teamId、sub=clientId(Service ID)、aud 固定 `https://appleid.apple.com`,有效期 180 天
 * (Apple 上限 6 个月);动态生成免手动轮换静态 secret。
 */
async function generateAppleClientSecret(opts: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): Promise<string> {
  const key = await importPKCS8(opts.privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: opts.keyId })
    .setIssuer(opts.teamId)
    .setSubject(opts.clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

/**
 * 从「接线层集中」的 env 派生 Better Auth 的 socialProviders 配置(ADR-006 范式)。
 * 只有当某提供方的凭据齐备时才注册它——凭据缺失(如本地未配 Google / Apple)就不装配,
 * 避免生成一个必然在回调时报错的 provider,也让登录页据此决定是否展示按钮。
 */
export function resolveSocialProviders(env: {
  google: { clientId: string; clientSecret: string };
  apple: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
    appBundleIdentifier: string;
  };
}): SocialProviders {
  const providers: SocialProviders = {};

  if (env.google.clientId && env.google.clientSecret) {
    providers.google = {
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
    };
  }

  // Apple:client secret 由私钥动态生成,故用 async factory(Better Auth 支持 provider 传函数)。
  // 生成 secret 需要私钥,因此四项(clientId/teamId/keyId/privateKey)齐备才注册,缺一即跳过。
  // appBundleIdentifier 供原生 iOS idToken 的 aud 校验——原生登录的 idToken aud 是 App bundle id
  // 而非 Service ID,不配会触发 JWT claim 校验失败;未配则省略该字段(仅走 web OAuth 时不需要)。
  const apple = env.apple;
  if (apple.clientId && apple.teamId && apple.keyId && apple.privateKey) {
    providers.apple = async () => ({
      clientId: apple.clientId,
      clientSecret: await generateAppleClientSecret(apple),
      ...(apple.appBundleIdentifier ? { appBundleIdentifier: apple.appBundleIdentifier } : {}),
    });
  }

  return providers;
}

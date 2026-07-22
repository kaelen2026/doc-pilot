import type { BetterAuthOptions } from "better-auth";

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

/**
 * 从「接线层集中」的 env 派生 Better Auth 的 socialProviders 配置(ADR-006 范式)。
 * 只有当某提供方的 clientId 与 clientSecret 都齐备时才注册它——凭据缺失(如本地未配 Google)
 * 就不装配,避免生成一个必然在回调时报错的 provider,也让登录页据此决定是否展示按钮。
 */
export function resolveSocialProviders(env: {
  google: { clientId: string; clientSecret: string };
}): SocialProviders {
  const providers: SocialProviders = {};

  if (env.google.clientId && env.google.clientSecret) {
    providers.google = {
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
    };
  }

  return providers;
}

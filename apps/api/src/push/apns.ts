import {
  type ApnsClient,
  createApnsClient,
  createApnsTokenSource,
  createHttp2Sender,
} from "@doc-pilot/push";
import { apiEnv } from "../env";
import { PushNotConfiguredError } from "../modules/push/push.errors";

let instance: ApnsClient | undefined;

/**
 * API 侧 APNS 客户端单例(接线层,类比 src/ai/gateway.ts 的 apiAIGateway)。
 * 凭据来自 apiEnv.apns;未配置则抛 PushNotConfiguredError(503),不静默降级。
 * 令牌来源带缓存(ES256 JWT,~50 分钟),传输走 node:http2。
 */
export function apiApnsClient(): ApnsClient {
  if (!apiEnv.apns) {
    throw new PushNotConfiguredError();
  }
  if (!instance) {
    const { teamId, keyId, privateKey, bundleId } = apiEnv.apns;
    instance = createApnsClient({
      tokenSource: createApnsTokenSource({ teamId, keyId, privateKey }),
      sender: createHttp2Sender(),
      bundleId,
    });
  }
  return instance;
}

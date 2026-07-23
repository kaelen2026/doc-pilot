import {
  type ApnsClient,
  createApnsClient,
  createApnsTokenSource,
  createHttp2Sender,
} from "@doc-pilot/push";
import { workerEnv } from "../env";

let instance: ApnsClient | undefined;

/**
 * Worker 侧 APNS 客户端单例(接线层,类比 apps/api/src/push/apns.ts)。
 * 凭据来自 workerEnv.apns;**未配置则返回 undefined**(而非抛错)——推送是 best-effort,
 * 缺凭据时整条通知推送通路不接线,文档处理照常。令牌来源带缓存(ES256 JWT),传输走 node:http2。
 */
export function workerApnsClient(): ApnsClient | undefined {
  if (!workerEnv.apns) {
    return undefined;
  }
  if (!instance) {
    const { teamId, keyId, privateKey, bundleId } = workerEnv.apns;
    instance = createApnsClient({
      tokenSource: createApnsTokenSource({ teamId, keyId, privateKey }),
      sender: createHttp2Sender(),
      bundleId,
    });
  }
  return instance;
}

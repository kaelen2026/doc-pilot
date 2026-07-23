import { DomainError } from "../../shared/errors";

/**
 * APNS 未配置(缺 team/key/私钥)。属于服务端配置缺失而非调用方错误,映射 503。
 * 正常部署应在 env 里配好 APNS_*(见 apps/api/src/env.ts)。
 */
export class PushNotConfiguredError extends DomainError {
  constructor(message = "APNS 未配置(缺 APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY)") {
    super("push_not_configured", message, 503);
  }
}

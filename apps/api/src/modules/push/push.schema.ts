import type { PushEnvironment, PushPlatform } from "@doc-pilot/contracts";
import {
  FCM_DEVICE_TOKEN,
  PUSH_DEVICE_TOKEN,
  PUSH_ENVIRONMENT,
  PUSH_PLATFORM,
} from "@doc-pilot/contracts";
import { ValidationError } from "../../shared/errors";

export interface RegisterDeviceInput {
  token: string;
  platform: PushPlatform;
  environment: PushEnvironment;
}

const PLATFORMS = new Set<string>(Object.values(PUSH_PLATFORM));
const ENVIRONMENTS = new Set<string>(Object.values(PUSH_ENVIRONMENT));
const HEX = /^[0-9a-f]+$/;
const FCM_TOKEN = /^[A-Za-z0-9_:.~-]+$/;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("请求体必须是对象");
  }
  return body as Record<string, unknown>;
}

/** POST /push/devices 入参校验。令牌规范化为小写去空白;平台/环境须是契约枚举值。 */
export function parseRegisterDevice(body: unknown): RegisterDeviceInput {
  const b = asRecord(body);

  if (typeof b.token !== "string") {
    throw new ValidationError("token 必填且为字符串");
  }
  if (typeof b.platform !== "string" || !PLATFORMS.has(b.platform)) {
    throw new ValidationError(`platform 必须是 ${[...PLATFORMS].join(" / ")}`);
  }
  if (typeof b.environment !== "string" || !ENVIRONMENTS.has(b.environment)) {
    throw new ValidationError(`environment 必须是 ${[...ENVIRONMENTS].join(" / ")}`);
  }

  const platform = b.platform as PushPlatform;
  const trimmed = b.token.trim();
  const token = platform === PUSH_PLATFORM.ios ? trimmed.toLowerCase() : trimmed;
  const valid =
    platform === PUSH_PLATFORM.ios
      ? token.length >= PUSH_DEVICE_TOKEN.minLength &&
        token.length <= PUSH_DEVICE_TOKEN.maxLength &&
        HEX.test(token)
      : token.length >= FCM_DEVICE_TOKEN.minLength &&
        token.length <= FCM_DEVICE_TOKEN.maxLength &&
        FCM_TOKEN.test(token);
  if (!valid) {
    throw new ValidationError(
      platform === PUSH_PLATFORM.ios
        ? "token 必须是合法的十六进制 APNS 设备令牌"
        : "token 必须是合法的 FCM 设备令牌",
    );
  }

  return {
    token,
    platform,
    environment: b.environment as PushEnvironment,
  };
}

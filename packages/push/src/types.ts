/**
 * APNS(Apple Push Notification service)集成的稳定类型。本包是 provider 通用层:
 * 只认「令牌来源 + HTTP/2 传输接缝 + 载荷」,凭据与端点的接线由使用方(apps/api)完成
 * ——与 @doc-pilot/ai 的「adapter 通用、接线层集中」同构(ADR-006)。
 */

/** APNS 环境。sandbox 对应开发构建(aps-environment=development),production 对应发布构建。 */
export type ApnsEnvironment = "sandbox" | "production";

/** APNS 载荷。`aps` 是 Apple 保留键,自定义键作为其同级兄弟(deep-link 等)。 */
export interface ApnsPayload {
  aps: {
    alert?: { title?: string; body?: string };
    badge?: number;
    sound?: string;
  };
  [key: string]: unknown;
}

/** 一次投递请求(已定位到具体设备令牌与环境)。 */
export interface ApnsSendRequest {
  /** 设备令牌(十六进制)。 */
  deviceToken: string;
  environment: ApnsEnvironment;
  payload: ApnsPayload;
  /** 覆盖默认 topic(bundleId);一般不传。 */
  topic?: string;
  /** 合并折叠 id(apns-collapse-id):同 id 的多条推送只保留最后一条。 */
  collapseId?: string;
}

/** APNS 返回。reason 见 Apple 文档(BadDeviceToken / Unregistered / …)。 */
export interface ApnsResponse {
  status: number;
  /** 非 2xx 时来自响应 body 的 reason 字段;2xx 时为空。 */
  reason?: string;
  /** apns-id 响应头,便于与 Apple 侧日志对账。 */
  apnsId?: string;
}

/**
 * HTTP/2 传输接缝(DI):真实实现走 node:http2(见 http2-sender.ts),
 * 单测注入假实现以断言 host/path/headers。这样 client 的编排逻辑可零网络单测。
 */
export interface ApnsSender {
  post(input: {
    host: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }): Promise<{
    status: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }>;
}

/** 缓存的 provider 令牌来源(JWT,ES256)。 */
export interface ApnsTokenSource {
  /** 返回当前有效的 provider JWT(过期则重新签发)。 */
  token(): string;
}

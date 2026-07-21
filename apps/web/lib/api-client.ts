import { API_URL } from "@/lib/env";

// 调用本应用 API 的统一入口:集中拼 API_URL 前缀、带 cookie 凭证、序列化 JSON body,
// 并把「失败响应 → 可展示错误」的抽取合到一处。原先各 feature 手写 `${API_URL}/...` +
// `credentials: "include"`,且 chat/api.ts 的 requireOk 与 documents/upload.ts 的
// errorMessage 各写了一份几乎相同的错误解析——现由本模块统一。
//
// 注意:仅用于本应用 API。客户端直传对象存储(预签名 PUT)用裸 fetch,不能带 credentials。

/** apiFetch 的 init:在 RequestInit 之上加 `json`(自动 content-type + 序列化);headers 收窄为普通对象。 */
export type ApiInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  json?: unknown;
};

/** 请求本应用 API:前缀 API_URL、默认带凭证;传 json 时自动设 content-type 并序列化。 */
export function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  const { json, headers, body, ...rest } = init;
  return fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : body,
  });
}

/**
 * 从失败响应里抽出可展示的错误信息:优先 body.message,其次 body.error,
 * 最后回退 `HTTP ${status}`。body 非 JSON 时也回退,不抛。
 */
export async function errorMessage(r: Response): Promise<string> {
  const body = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `HTTP ${r.status}`;
}

/** 对失败响应抛 Error(信息由 errorMessage 决定);成功原样返回,便于链式取 body。 */
export async function requireOk(r: Response): Promise<Response> {
  if (!r.ok) {
    throw new Error(await errorMessage(r));
  }
  return r;
}

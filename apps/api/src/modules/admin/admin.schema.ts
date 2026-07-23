import { PUSH_TEST_MESSAGE } from "@doc-pilot/contracts";
import { ValidationError } from "../../shared/errors";

export interface UsageQuery {
  /** 统计窗口天数(含今天往前),1..365,默认 30。 */
  days: number;
}

export interface PageQuery {
  limit: number;
  offset: number;
}

const USAGE_MAX_DAYS = 365;
const USAGE_DEFAULT_DAYS = 30;
const PAGE_MAX_LIMIT = 100;
const PAGE_DEFAULT_LIMIT = 50;

/** 解析整数查询参数;缺省返回 fallback,非法(非整数/越界)抛 ValidationError。 */
function parseIntParam(
  raw: string | undefined,
  { name, min, max, fallback }: { name: string; min: number; max: number; fallback: number },
): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return n;
}

/** GET /admin/usage 的 ?days= 校验。 */
export function parseUsageQuery(query: { days?: string }): UsageQuery {
  return {
    days: parseIntParam(query.days, {
      name: "days",
      min: 1,
      max: USAGE_MAX_DAYS,
      fallback: USAGE_DEFAULT_DAYS,
    }),
  };
}

/** 列表端点的分页参数校验。 */
export function parsePageQuery(query: { limit?: string; offset?: string }): PageQuery {
  return {
    limit: parseIntParam(query.limit, {
      name: "limit",
      min: 1,
      max: PAGE_MAX_LIMIT,
      fallback: PAGE_DEFAULT_LIMIT,
    }),
    offset: parseIntParam(query.offset, {
      name: "offset",
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    }),
  };
}

export interface TestPushInput {
  /** 收件用户邮箱。 */
  email: string;
  title: string;
  body: string;
}

const DEFAULT_TEST_TITLE = "DocPilot 测试推送";
const DEFAULT_TEST_BODY = "如果你收到这条通知,说明推送链路已打通 🎉";

/** 解析可选文案:缺省用默认值;非字符串或超长即抛 ValidationError。 */
function parseTestText(raw: unknown, fallback: string, max: number, name: string): string {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  if (typeof raw !== "string") {
    throw new ValidationError(`${name} 必须是字符串`);
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return fallback;
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${name} 不能超过 ${max} 字`);
  }
  return trimmed;
}

/** POST /admin/push-test 入参校验。email 必填(需含 @);title/body 可选,缺省用默认文案。 */
export function parseTestPush(body: unknown): TestPushInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("请求体必须是对象");
  }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (email === "" || !email.includes("@")) {
    throw new ValidationError("email 必填且需为合法邮箱");
  }
  return {
    email,
    title: parseTestText(b.title, DEFAULT_TEST_TITLE, PUSH_TEST_MESSAGE.titleMax, "title"),
    body: parseTestText(b.body, DEFAULT_TEST_BODY, PUSH_TEST_MESSAGE.bodyMax, "body"),
  };
}

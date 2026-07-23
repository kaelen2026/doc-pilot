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

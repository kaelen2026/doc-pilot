import { NOTIFICATION_TYPE } from "@doc-pilot/contracts";

/**
 * 通知点击后的目标路由;无法定位资源时返回 null(该条不可点)。
 * - ready:直接进问答(处理完成的价值兑现)。
 * - failed:回文档列表(那里展示失败原因)。
 */
export function notificationHref(n: {
  type: string;
  resourceType: string | null;
  resourceId: string | null;
}): string | null {
  if (n.resourceType !== "document" || !n.resourceId) {
    return null;
  }
  if (n.type === NOTIFICATION_TYPE.documentReady) {
    return `/documents/${n.resourceId}/chat`;
  }
  if (n.type === NOTIFICATION_TYPE.documentFailed) {
    return "/documents";
  }
  return null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间:刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期(超 7 天)。
 * now 由调用方注入(便于测试);非法输入返回空串。
 */
export function formatRelativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diff = now - then;
  if (diff < MINUTE) {
    return "刚刚";
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} 分钟前`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} 小时前`;
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)} 天前`;
  }
  const d = new Date(then);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

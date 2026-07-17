/**
 * 自然月起点(UTC)。月度配额按此对齐:同一自然月内的用量累加,跨月自动清零。
 * 纯函数,便于单测。
 */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

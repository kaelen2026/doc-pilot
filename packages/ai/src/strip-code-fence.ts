/**
 * 剥掉模型偶尔给 JSON 加上的 ```json … ``` 围栏；无围栏则去掉首尾空白后原样返回。
 * generateObject 与 answer-stream 尾部 JSON 解析共用同一份实现,避免两处漂移。
 */
export function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? (match[1] ?? "") : text.trim();
}

/**
 * 流式 Markdown 前沿补全。
 *
 * 打字机逐字揭示,会停在标记中途——揭示到 `**安` 时 `**` 尚未闭合,react-markdown 先按
 * 字面渲染 `**` 再在闭合瞬间跳成粗体,即「半截 markdown 闪烁」。本函数对**已揭示前缀**补全
 * 未闭合的内联标记(`**` 粗体、`*` 斜体、`` ` `` 内联代码),让前沿立即以最终样式渲染。
 *
 * 规则:
 * - 有内容的未闭合开启符 → 追加对应收尾符(内层先收尾,保持嵌套正确);
 * - 开启符恰在末尾(还没内容)→ 剥离,免得裸符号闪一下;
 * - 反引号优先:代码跨度内的 `*` 不当强调误补;`[n]` 引用标记不受影响。
 *
 * 纯函数,渲染无关,便于单测。完成态用未改动的原文(见 answer-markdown),故最终必然正确。
 */
export function completeStreamingMarkdown(input: string): string {
  let inCode = false;
  let bold = false;
  let italic = false;
  let codeAt = -1;
  let boldAt = -1;
  let italicAt = -1;

  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === "`") {
      inCode = !inCode;
      if (inCode) codeAt = i;
      i += 1;
      continue;
    }
    // 代码跨度内不解析强调标记。
    if (inCode) {
      i += 1;
      continue;
    }
    if (c === "*") {
      if (input[i + 1] === "*") {
        bold = !bold;
        if (bold) boldAt = i;
        i += 2;
        continue;
      }
      italic = !italic;
      if (italic) italicAt = i;
      i += 1;
      continue;
    }
    i += 1;
  }

  const open: { at: number; close: string; len: number }[] = [];
  if (inCode) open.push({ at: codeAt, close: "`", len: 1 });
  if (bold) open.push({ at: boldAt, close: "**", len: 2 });
  if (italic) open.push({ at: italicAt, close: "*", len: 1 });
  if (open.length === 0) return input;

  open.sort((a, b) => a.at - b.at);
  const innermost = open[open.length - 1];
  if (!innermost) return input;
  // 最内层开启符正好贴在末尾(还没内容)→ 剥离后重新求解(外层可能仍需收尾)。
  if (innermost.at + innermost.len === input.length) {
    return completeStreamingMarkdown(input.slice(0, innermost.at));
  }
  // 从内层到外层依次追加收尾符。
  let out = input;
  for (const marker of [...open].reverse()) {
    out += marker.close;
  }
  return out;
}

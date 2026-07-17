/**
 * Token 估算(无 tokenizer 依赖的近似值)。
 *
 * 用途只是给切片器控制块大小,不需要与某个模型精确对齐:
 * - CJK 字符按 1 token/字(中文分词后大致如此)。
 * - 其余文本按 ~4 字符/token(英文常见经验值)。
 *
 * Phase 5/6 真正调用模型时,以 AI Gateway 返回的 usage 为准。
 */

// 覆盖常用汉字、假名、谚文等 CJK 区段。
const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/gu;

export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  const cjk = text.match(CJK_PATTERN)?.length ?? 0;
  const rest = text.replace(CJK_PATTERN, "");
  // 非 CJK 部分按去掉多余空白后的字符数估算。
  const restChars = rest.replace(/\s+/g, " ").trim().length;
  return cjk + Math.ceil(restChars / 4);
}

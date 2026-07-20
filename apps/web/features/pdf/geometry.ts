import type { NormRect } from "./use-pdf-highlights";

/**
 * PDF 阅读器的纯几何:命中判定、坐标归一化、整页缩放、阅读线页码判定。
 * 从组件里抽出、与 DOM/渲染解耦,便于对这些复发过视觉问题的逻辑(见 #46)写不变量单测。
 * 只依赖 DOMRect 的数值字段(RectLike),不触碰 window/document。
 */

/** 命中/归一化只需要这些字段,浏览器的 DOMRect 天然满足。 */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** 一页的页码 + 其在视口中的包围盒。 */
export interface PageSlot {
  page: number;
  box: RectLike;
}

/**
 * 把一组 client rects 按「中心点落在哪一页」归一化,跨页选择自然分派到各页。
 * - 命中:rect 中心点在页框内(含边界),取首个命中的页(页框不重叠,首个即唯一)。
 * - 归一化:相对页框左上角 / 页框宽高,得到 [0,1] 区间的 NormRect,缩放/全屏后仍能复原。
 * - 过滤:宽或高不足 1px 的碎 rect(选区边缘噪声)跳过。
 */
export function rectsToNormalizedByPage(
  rects: readonly RectLike[],
  slots: readonly PageSlot[],
): Map<number, NormRect[]> {
  const byPage = new Map<number, NormRect[]>();
  for (const r of rects) {
    if (r.width < 1 || r.height < 1) {
      continue;
    }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (const { page, box: b } of slots) {
      if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
        const arr = byPage.get(page) ?? [];
        arr.push({
          x: (r.left - b.left) / b.width,
          y: (r.top - b.top) / b.height,
          w: r.width / b.width,
          h: r.height / b.height,
        });
        byPage.set(page, arr);
        break;
      }
    }
  }
  return byPage;
}

/**
 * 顶部阅读线所在的页:最后一个「顶边 <= line」的 slot。
 * slots 需按页面在视口中的位置升序传入(即页码升序)。无命中回退第 1 页。
 */
export function pageAtLine(line: number, slots: readonly { page: number; top: number }[]): number {
  let cur = 1;
  for (const s of slots) {
    if (s.top <= line) {
      cur = s.page;
    } else {
      break;
    }
  }
  return cur;
}

/**
 * 「整页」缩放:取宽约束(1,即适宽)与高约束的较小者,再夹到最小缩放,
 * 使当前页在可视高度内完整可见。padding 为可视区上下留白(与渲染一致的 32px)。
 */
export function fitPageScale(
  boxHeight: number,
  fitWidth: number,
  baseAspect: number,
  minScale: number,
  padding = 32,
): number {
  const byWidth = 1;
  const byHeight = (boxHeight - padding) / (fitWidth * baseAspect);
  return Math.max(minScale, Math.min(byWidth, byHeight));
}

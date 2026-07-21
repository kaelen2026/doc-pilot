/**
 * 命令面板结果列表的键盘导航下标数学(纯函数,便于单测)。
 * - 空列表恒返回 -1(无可选项)。
 * - 未选中(current < 0)时:向下(delta>0)选第一项,向上选最后一项。
 * - 否则在 [0, length-1] 之间循环移动(到边界 wrap)。
 */
export function moveSelection(current: number, delta: number, length: number): number {
  if (length <= 0) {
    return -1;
  }
  if (current < 0) {
    return delta > 0 ? 0 : length - 1;
  }
  return (current + delta + length) % length;
}

// 主题解析纯逻辑:与 DOM/React 解耦,单测钉住(见 theme.test.ts)。
// 落地策略:全站组件消费墨水纸语义 token,深色模式只在 [data-theme="dark"]
// 作用域覆盖 globals.css 里那几个基础 token,组件自动跟随,无需逐个加 dark: 变体。

/** 用户的主题选择(存 localStorage);system 表示跟随系统偏好。 */
export type ThemeChoice = "system" | "light" | "dark";

/** 解析后落到 <html data-theme> 的实际主题,只有明暗两种。 */
export type ResolvedTheme = "light" | "dark";

/** 切换按钮循环顺序:system → light → dark → system。 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

/** localStorage 键;与 layout.tsx 无闪烁内联脚本共用同一常量。 */
export const THEME_STORAGE_KEY = "docpilot-theme";

const CHOICE_SET = new Set<string>(THEME_CHOICES);

/** 读 localStorage 原始值 → 合法选择;非法/缺失回退 system。 */
export function parseThemeChoice(raw: string | null): ThemeChoice {
  return raw && CHOICE_SET.has(raw) ? (raw as ThemeChoice) : "system";
}

/** 选择 + 系统偏好 → 实际主题。显式选择直接生效,system 才看偏好。 */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return choice;
}

/** 循环到下一个选择(闭合)。 */
export function nextChoice(choice: ThemeChoice): ThemeChoice {
  const i = THEME_CHOICES.indexOf(choice);
  // 取模保证落在合法下标内,故断言非 undefined(noUncheckedIndexedAccess)
  return THEME_CHOICES[(i + 1) % THEME_CHOICES.length] as ThemeChoice;
}

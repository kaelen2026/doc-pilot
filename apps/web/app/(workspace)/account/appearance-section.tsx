"use client";

import { THEME_CHOICES, type ThemeChoice } from "@/features/theme/theme";
import { useTheme } from "@/features/theme/use-theme";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./settings-section";

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

/** 外观:主题三态分段控件(跟随系统 / 浅色 / 深色),复用 features/theme 的控制器。 */
export function AppearanceSection() {
  const { choice, setChoice } = useTheme();

  return (
    <SettingsSection title="外观" description="选择界面主题;「跟随系统」会随系统深浅色偏好切换">
      <div className="px-5 py-5">
        {/* fieldset+legend 给这组主题选项一个可访问的组名;分段控件用 toggle button + aria-pressed 表达单选 */}
        <fieldset className="inline-flex gap-1 rounded-lg border-0 bg-paper-sunken p-1">
          <legend className="sr-only">主题</legend>
          {THEME_CHOICES.map((c) => {
            const active = choice === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setChoice(c)}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "bg-card text-ink shadow-paper-xs"
                    : "text-ink-soft [@media(hover:hover)]:hover:text-ink",
                )}
              >
                {THEME_LABEL[c]}
              </button>
            );
          })}
        </fieldset>
      </div>
    </SettingsSection>
  );
}

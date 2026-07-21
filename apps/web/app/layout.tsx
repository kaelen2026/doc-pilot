import type { Metadata } from "next";
import { Literata } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_STORAGE_KEY } from "@/features/theme/theme";
import { APP_URL } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

// 无闪烁:首帧前(hydration 之前)据 localStorage / 系统偏好把 data-theme 落到 <html>,
// 逻辑与 features/theme/theme.ts 的 parseThemeChoice+resolveTheme 一致(此处内联版无法 import)。
const themeScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var v=localStorage.getItem(k);var t=(v==="dark"||v==="light")?v:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){}})();`;

// display 字体：TypeTogether 为屏上长文阅读设计（Google Play Books 正文字体），
// 与"文档工作台"气质同构。仅拉丁字形，中文由 font-display 栈里的宋体系衬线兜底。
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  // 子页面导出 title: "登录" 会被套成 "登录 · DocPilot"；根路由用 default。
  title: { default: "DocPilot", template: "%s · DocPilot" },
  description: "AI 文档工作台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning:内联脚本会在 hydration 前改 <html data-theme>,属预期外部变更
    <html lang="zh-CN" className={literata.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 常量脚本、无用户输入,首帧前设主题防闪烁 */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

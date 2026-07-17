import type { Metadata } from "next";
import { Literata } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// display 字体：TypeTogether 为屏上长文阅读设计（Google Play Books 正文字体），
// 与"文档工作台"气质同构。仅拉丁字形，中文由 font-display 栈里的宋体系衬线兜底。
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocPilot",
  description: "AI 文档工作台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh" className={literata.variable}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}

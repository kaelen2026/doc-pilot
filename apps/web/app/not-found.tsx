import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-6">
      <p className="font-display text-sm text-ink-faint tabular-nums">404</p>
      <h1 className="font-display text-2xl font-medium">页面不存在</h1>
      <p className="text-sm leading-[1.7] text-ink-soft">你访问的页面没有找到。</p>
      <Button asChild className="w-fit">
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}

import { cn } from "@/lib/utils";

/** 印章式品牌标记：朱红方章里一个「档」字。首页/登录复用。 */
export function SealMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-sm bg-seal pt-0.5 font-display leading-none text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      档
    </span>
  );
}

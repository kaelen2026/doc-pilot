import { cn } from "@/lib/utils";

/**
 * 印章式品牌标记:朱红方框里一枚篆意宋体「档」,直接钤在纸面上(无底色方块)。
 * 与 favicon(app/icon.svg)、iOS AppIcon 同源——那两处是带手钤质感的定版资产,
 * 此处内联版走干净几何(小尺寸下手钤纹理本就不可见),并用 text-seal 令朱红随主题深浅
 * 走 token,不写死色值。首页/登录/侧栏复用。
 */
export function SealMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="presentation"
      aria-hidden="true"
      className={cn("text-seal", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="62"
        y="62"
        width="388"
        height="388"
        rx="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="26"
      />
      {/* 内联 fontSize 压过 body 继承字号(否则 512 视图里会被缩成 16px);篆意由宋体系衬线承载 */}
      <text
        x="256"
        y="272"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Songti SC','STSong','Noto Serif CJK SC','SimSun',serif"
        fontWeight="600"
        fill="currentColor"
        style={{ fontSize: 264 }}
      >
        档
      </text>
    </svg>
  );
}

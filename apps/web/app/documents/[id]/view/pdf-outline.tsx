"use client";

/** PDF 内嵌书签目录节点(pdf.getOutline() 的子集)。 */
export type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
};

/** 目录树:递归渲染书签,点击跳到对应 dest。 */
export function OutlineTree({
  nodes,
  onPick,
  depth = 0,
}: {
  nodes: OutlineNode[];
  onPick: (dest: OutlineNode["dest"]) => void;
  depth?: number;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={`${depth}:${n.title}`}>
          <button
            type="button"
            onClick={() => onPick(n.dest)}
            style={{ paddingLeft: depth * 12 + 12 }}
            className="block w-full truncate py-1 pr-3 text-left text-xs text-ink-soft transition-colors [@media(hover:hover)]:hover:bg-paper-sunken [@media(hover:hover)]:hover:text-ink"
            title={n.title}
          >
            {n.title}
          </button>
          {n.items?.length ? (
            <OutlineTree nodes={n.items} onPick={onPick} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

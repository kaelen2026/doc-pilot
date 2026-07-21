"use client";

import { memo } from "react";

/** 用户提问:右侧纸凹便签。memo:流式逐帧重渲时,历史项 props 不变即跳过。 */
export const UserNote = memo(function UserNote({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-md bg-paper-sunken px-3.5 py-2.5 text-sm leading-[1.7] text-ink-soft">
        {content}
      </p>
    </div>
  );
});

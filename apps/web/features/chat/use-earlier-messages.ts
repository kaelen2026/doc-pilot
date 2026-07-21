"use client";

import { MESSAGE_PAGE } from "@doc-pilot/contracts";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MessageItem } from "./types";
import { useMessages } from "./use-chat";

/** 消息窗口 + 「加载更早」的分页与滚动保持。 */
export interface EarlierMessages {
  /** 当前窗口内的消息(完整历史的后缀,升序)。 */
  messages: MessageItem[];
  /** 服务端是否还有更早的消息。 */
  hasMore: boolean;
  /** 窗口已到服务端上限:即便还有更早消息,当前分页方式也无法再往前拉。 */
  atWindowCap: boolean;
  isFetching: boolean;
  /** 向前扩窗一页,并在新窗口渲染后回补滚动位置。 */
  loadEarlier: () => void;
}

/**
 * 消息窗口:只加载最近 limit 条,向上「加载更早」时递增(窗口即完整历史的后缀)。
 * 上限为契约的 MESSAGE_PAGE.max——服务端对超限 limit 会封顶,客户端必须同口径,
 * 否则窗口到顶后仍无限递增、每次都拿回同样的 max 条,「加载更早」变成死按钮(见架构体检 F)。
 * 扩窗会在顶部插入内容,故记录扩窗前文档高度,待新窗口渲染后按增量回补 scrollY,
 * 保持用户当前阅读位置不跳动。
 */
export function useEarlierMessages(conversationId: string | undefined): EarlierMessages {
  const [limit, setLimit] = useState<number>(MESSAGE_PAGE.size);
  const messagesQuery = useMessages(conversationId, limit);
  const messages = messagesQuery.data?.messages ?? [];
  const hasMore = messagesQuery.data?.hasMore ?? false;
  const atWindowCap = limit >= MESSAGE_PAGE.max;

  const anchorRef = useRef<number | null>(null);
  const loadEarlier = useCallback(() => {
    anchorRef.current = document.documentElement.scrollHeight;
    setLimit((l) => Math.min(l + MESSAGE_PAGE.size, MESSAGE_PAGE.max));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages 是「新窗口已渲染」的触发信号,非在体内读取
  useLayoutEffect(() => {
    if (anchorRef.current == null) {
      return;
    }
    const delta = document.documentElement.scrollHeight - anchorRef.current;
    if (delta > 0) {
      window.scrollBy(0, delta);
    }
    anchorRef.current = null;
  }, [messages]);

  return { messages, hasMore, atWindowCap, isFetching: messagesQuery.isFetching, loadEarlier };
}

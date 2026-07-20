"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { ensureConversation, fetchMessages, streamAnswer } from "./api";

/** 正在生成的回答(SSE 进行中),流结束后由 messages 重新拉取接管。 */
export interface StreamingState {
  phase: "retrieving" | "streaming";
  clientRequestId: string;
  question: string;
  text: string;
  sourceCount: number | null;
}

export function useConversation(documentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["conversation", documentId],
    queryFn: () => ensureConversation(documentId),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * 消息窗口:只取最近 limit 条(升序)。limit 递增即「加载更早」;
 * placeholderData 保留上一窗口,翻页时不闪空。发送后按前缀 ["messages", id]
 * 失活即刷新当前窗口(含新消息对)。
 */
export function useMessages(conversationId: string | undefined, limit: number) {
  return useQuery({
    queryKey: ["messages", conversationId, limit],
    queryFn: () => fetchMessages(conversationId as string, limit),
    enabled: !!conversationId,
    placeholderData: keepPreviousData,
  });
}

/**
 * 提问 + 消费 SSE。deltas 逐段累积进 streaming.text;
 * completed / failed / replayed 都以「重拉 messages」收尾,服务端落库结果是唯一事实源。
 */
export function useSendMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(
    async (input: { content: string; clientRequestId?: string }) => {
      if (!conversationId || inFlight.current) {
        return;
      }
      inFlight.current = true;
      setSendError(null);
      const clientRequestId = input.clientRequestId ?? crypto.randomUUID();
      setStreaming({
        phase: "retrieving",
        clientRequestId,
        question: input.content,
        text: "",
        sourceCount: null,
      });
      try {
        for await (const ev of streamAnswer({
          conversationId,
          content: input.content,
          clientRequestId,
        })) {
          switch (ev.event) {
            case "retrieval.completed":
              setStreaming(
                (s) => s && { ...s, phase: "streaming", sourceCount: ev.data.sourceCount },
              );
              break;
            case "message.delta":
              setStreaming((s) => s && { ...s, phase: "streaming", text: s.text + ev.data.text });
              break;
            case "message.failed":
              setSendError(`生成失败(${ev.data.errorCode}),可重试`);
              break;
            default:
              // message.started/citation/usage/completed/replayed:最终以落库消息为准。
              break;
          }
        }
      } catch (err) {
        setSendError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlight.current = false;
        setStreaming(null);
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    },
    [conversationId, queryClient],
  );

  return { send, streaming, sendError };
}

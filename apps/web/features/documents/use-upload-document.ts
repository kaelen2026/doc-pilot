"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadDocument } from "./upload";

/**
 * 上传 PDF 的 mutation。成功后使 ["documents"] 失效,
 * 列表随即刷新并因新文档处于在途状态而自动开始轮询(见 use-documents)。
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

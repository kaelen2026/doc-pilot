import { apiAIGateway } from "../../ai/gateway";
import { scopedSearchRepo } from "./search.repository";
import { groupResults, type SearchResultGroup } from "./search-results";

/**
 * 全局搜索业务编排:查询向量化(经 AI Gateway)→ 跨 workspace 向量召回 → 按文档分组。
 * embedding / 检索失败抛领域或 AI_* 错误,由 app.onError 统一映射,不在此拼状态码。
 */
export async function searchDocuments(params: {
  workspaceId: string;
  userId: string;
  query: string;
}): Promise<SearchResultGroup[]> {
  const repo = scopedSearchRepo(params.workspaceId);
  const gateway = apiAIGateway();
  const candidates = await repo.searchChunks({
    gateway,
    query: params.query,
    metadata: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      traceId: crypto.randomUUID(),
    },
  });
  return groupResults(candidates);
}

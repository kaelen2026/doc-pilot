/**
 * 对象存储 Key 规则（见 docs/architecture/data-model.md §9.1）。
 * 不使用用户文件名作为 Key。
 */
export function buildOriginalObjectKey(input: {
  workspaceId: string;
  documentId: string;
  version: number;
}): string {
  return `workspaces/${input.workspaceId}/documents/${input.documentId}/v${input.version}/original.pdf`;
}

export function buildDerivedObjectKey(input: {
  workspaceId: string;
  documentId: string;
  version: number;
  name: string;
}): string {
  return `workspaces/${input.workspaceId}/documents/${input.documentId}/v${input.version}/${input.name}`;
}

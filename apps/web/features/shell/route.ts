/**
 * 沉浸式路由:阅读原文(`/documents/:id/view`)与问答(`/documents/:id/chat`)
 * 把横向空间让给 PDF 阅读器 / 对话流,故侧栏默认折叠为窄图标栏(用户仍可手动展开)。
 * 其余工作台页面(文档列表、设置)侧栏默认展开。
 */
export function isImmersiveRoute(pathname: string): boolean {
  return /^\/documents\/[^/]+\/(view|chat)$/.test(pathname);
}

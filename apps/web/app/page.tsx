export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-neutral-400">Phase 1 · 基础工程</p>
        <h1 className="text-4xl font-semibold tracking-tight">DocPilot</h1>
        <p className="text-lg text-neutral-300">
          AI 文档工作台 — 上传 PDF，解析、切片、向量化、摘要，再基于文档做带页码引用的问答。
        </p>
      </div>
      <p className="text-sm text-neutral-500">
        脚手架已就绪。功能按 <code className="text-neutral-300">.ai/plans/roadmap.md</code> 的 Phase
        2–7 逐步接入。
      </p>
    </main>
  );
}

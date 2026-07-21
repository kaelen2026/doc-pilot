# 本机隔离 Staging 验收与容量基准实施计划

1. 增加生产 Compose overlay，以固定 project、独立端口和 project-scoped volumes 隔离环境。
2. 增加 env 生成器，从主 worktree `.env` 复制真实文本模型接线，强制 Embedding 指向本机 Ollama。
3. 增加 lifecycle CLI，覆盖 config、up、status、down、purge，并在失败时采集诊断。
4. 抽出可复用的多页 PDF 生成器和可指定文件的 API 上传 helper。
5. 增加专用 Playwright Staging 配置与容量用例，顺序执行 10/100/500 页处理和三问闭环。
6. 采集容器资源、数据库状态、队列状态、AI usage/cost，生成 JSON 与 Markdown 报告。
7. 对 env 脱敏、预算、报告聚合、PDF 页数生成增加零成本测试；普通 E2E 排除高成本用例。
8. 更新部署文档和根命令说明，运行 lint、typecheck、test、build、Compose config。
9. 启动隔离 Staging，用真实模型跑完整验收；根据报告修复阻塞并记录实测基线。

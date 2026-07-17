## 变更说明

<!-- 这个 PR 做了什么、为什么做。关联设计文档/ADR 的,给出链接。 -->

## 变更类型

- [ ] feat:新功能
- [ ] fix:缺陷修复
- [ ] docs:文档(设计文档保持中文)
- [ ] ci / chore:工程配置
- [ ] refactor / perf / test:重构、性能、测试

## 关联

<!-- 关联 issue(如 Closes #123)、roadmap Phase、或相关 ADR;没有则删除本节。 -->

## 自查清单

- [ ] 分支从 `main` 切出,提交信息符合 Conventional Commits
- [ ] `pnpm lint` 本地通过
- [ ] 涉及实现时,已对照 `docs/` 中对应设计文档(schema / 接口 / SQL 为准)
- [ ] 未违反架构不变式(租户隔离、Outbox、幂等、AI Gateway 等,见 CLAUDE.md)
- [ ] 行为变更已同步更新相关文档

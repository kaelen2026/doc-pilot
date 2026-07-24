# Android 原生 Agent 设计

## 目标

在 `.claude/agents/` 新增 `android-native` 子代理定义，为 `apps/android/` 的原生 Android
工作提供明确的技术边界、工程事实和本地质量门禁。此次只新增 agent 配置，不创建或修改
Android 工程。

## 设计

- 采用独立的 `.claude/agents/android-native.md`，与现有 `ios-native` 保持同级但不机械复制。
- Agent 只负责 `apps/android/`：Kotlin、Jetpack Compose、Material 3、Gradle、资源及 Android
  测试。TypeScript monorepo 的 API、契约或后端改动交还主 agent。
- 工程事实以 `apps/android` 内的 Gradle 配置为准，包括单 `:app` module、SDK 版本、JVM 版本、
  application ID 和本地 API 地址；不把易过期版本号重复写入 agent。
- 本地门禁优先使用仓库 Gradle Wrapper，至少覆盖 assemble、单元测试和 lint；只有存在可用设备
  或模拟器时才要求 instrumentation test，并忠实报告未执行项。
- 延续 DocPilot 的目录隔离、品牌 token 对齐、环境配置集中和 worktree/PR 流程。

## 验收

1. `.claude/agents/android-native.md` 的 frontmatter 可被 Claude agent 机制识别。
2. 描述能在任务仅落于 `apps/android/` 时准确触发，并明确排除 TS monorepo。
3. 文件中的构建命令可从 `apps/android/` 执行，且不依赖全局 Gradle。
4. 不修改 `apps/android/` 或其他业务代码。

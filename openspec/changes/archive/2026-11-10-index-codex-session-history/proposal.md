## Why

会话 adcdfb6e-9964-4ef6-b257-8a6ad34ee75e 的 Codex rollout 已达 1,011 MiB。历史接口全量解析后才截取 30 条，已有测量为 28.1 秒，超过前端 20 秒截止；用量接口重复解析同一文件。

## What Changes

- 用共享、增量的文件位置索引支持 Codex 历史分页和用量统计，冷读跳过不展示的 JSON 内容，热读只解析目标页正文。
- 保留消息编号、工具结果回填、每轮统计、评审 cwd 边界和现有接口；处理追加、截断、替换、无效行及未写完的尾行。
- 不修改用户原始会话文件，不引入数据库迁移，不通过提高浏览器超时掩盖开销。

## Capabilities

### New Capabilities

- `indexed-codex-history`: 大型 Codex 会话的增量历史读取与共享用量统计。

### Modified Capabilities

无。

## Impact

仅 tool-claude-chat 的 SessionHistoryService、聚焦的 Codex 历史索引实现与测试。设计依据为已归档 Bug 分析及当前源码定向复核；无未决业务选择，无第三方依赖或外部协议变更。

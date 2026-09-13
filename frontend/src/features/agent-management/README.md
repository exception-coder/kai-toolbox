# Agent 管理

统一入口 `/tools/agent-management`，包含「Agent 列表」和「评测中心」。侧栏不再单列回归评测。

- Agent 列表管理配置、能力、版本及教学 Agent；在详情的「评测」页打开评测中心，会带入该 Agent 和快照题集。
- 评测中心集中处理样本来源、黄金集回归、运行结果和历史退化对比，也支持缺陷抽取等独立能力。
- 切换工作台视图保留当前未保存草稿；更换 Agent 会加载另一份配置。浏览器刷新仍需先保存草稿。
- `section=evaluation` 打开评测中心；`agent`、`tab` 定位 Agent 详情，`dataset`、`run`、`base` 保存评测选择。
- 旧 `/tools/eval` 自动替换到统一入口，保留查询参数与 hash。

题集未纳入、用例未启用或执行器缺失时不能开始评测，可检查样本来源或查看全部评测。API 失败提供重试。

通用回归仍使用 `/api/eval`，不验证候选版本完整配置，也不会自动改写发布门禁。Agent 详情现有的评测信息登记保持原行为；可信候选版本评测需后端执行契约与结果绑定，不能将入口合并当作该能力已经实现。

菜单权限统一为 `menu:agent-management`，包括旧评测地址；原本只有 `menu:eval` 的账号需管理员配置新的菜单权限。权限目录从 FeatureManifest 自动生成，不在 Java 中手工登记。

实现及验收记录：[centralize-agent-evaluation](../../../../openspec/changes/centralize-agent-evaluation/proposal.md)。

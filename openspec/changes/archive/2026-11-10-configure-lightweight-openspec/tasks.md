# 实施与验收

## 1. 模板与工具更新

- [x] 1.1 配置简版 schema、大纲与按需设计，固定旧 Change 绑定并同步架构；通过实际 CLI 验证依赖、校验、skip_specs、归档及消费者 JSON。
- [x] 1.2 升级 OpenSpec，核对更新范围、旧减负场景和项目质量结果后提交；保留未执行的模型与运行验收边界。

## 验证记录

- 本机 CLI 从 1.6.0 升级至 1.15.0。update dry-run 没有可刷新工具；实际 update 提示没有配置工具，未强制清理自定义 openspec/AGENTS.md 或全局旧指令，也未宣称已安装新生成 Skill。当前通过 CLI 使用项目 schema。
- schema validate 无问题；新 Change 实际选中 forge-lite，119 个旧活动 Change 补齐单行 spec-driven 元数据，不改正文或任务、不推定创建日期。抽查既有显式绑定及补齐绑定均保持 spec-driven。
- 隔离临时目录共 16 项真实 CLI 检查通过：简版无 design 就绪、缺 tasks/proposal/specs 阻断、短模板及条件设计指令、显式 skip_specs、任务序号/说明/进度、产物路径和列表 JSON、勾选完成、官方 archive 同步及旧 schema 完整产物链。归档仅在临时夹具执行，真实项目 Change 未归档。
- 当前 Change 和旧减负 Change 均通过新版 strict；旧减负增量保留原 6 个场景名称并按已实现的可选归档策略更新预期，修复新版发现的场景遗漏。
- 项目质量入口 status=PASSED、exit 0；executedCheckers 为空，9 项既有 API 探针通过，不作为本次模板质量或模型执行证据。架构受影响 Mermaid 解析通过，未执行真实浏览器渲染。
- 未新增单元测试、未运行全仓构建、未修改 Web 交互或 Forge 调度代码、未重启服务。模板与 CLI 已可在下一次命令中使用；真实模型是否按需精简文档、必要设计是否充分，仍须实际任务审阅，不能由结构校验代替。

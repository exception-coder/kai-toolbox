## Why

当前平台已能探测和初始化项目的 OpenSpec，但缺少一个以项目、需求和任务为层级的统一视图。用户需要直接看到各项目活动需求、任务完成度和执行状态，并从看板进入对应规格或开发会话，同时保持 OpenSpec 为任务完成事实的唯一来源。

## What Changes

- 新增 OpenSpec 研发任务看板，按“项目 → Change 需求 → Task 任务”组织信息。
- 通过受控 OpenSpec CLI 读取项目上下文、活动 change、artifact 路径和结构化任务，不建立平行任务清单。
- 提供项目总览和单需求任务看板两种粒度，以及搜索、筛选、刷新和规格跳转能力。
- 将 OpenSpec 的待办/完成事实与可信运行时上下文组合为待执行、进行中、待验证、阻塞和已完成状态；证据不足时降级为较少状态，不从聊天文本或更新时间猜测状态。
- 第一阶段保持看板只读；完成、阻塞和拖拽变更不绕过 OpenSpec 与验证门禁。
- 补齐空数据、CLI 不可用、项目未初始化、缓存过期、局部项目失败和窄屏恢复路径。

## Capabilities

### New Capabilities

- `openspec-task-board`: 定义跨工作区项目发现、OpenSpec change 与 task 投影、可信状态映射、看板浏览和恢复行为。

### Modified Capabilities

无。

## Impact

- 后端：扩展 `tool-claude-chat` 中的 OpenSpec CLI 适配与工作区项目边界校验，新增只读看板查询能力。
- 前端：新增独立 OpenSpec 看板 feature，复用现有工作台布局和公开会话跳转能力，不与 `delivery-center` 的 PRD 交付模型混用。
- API：预计新增项目看板和单 change 详情只读接口；具体契约在设计阶段确定。
- 数据：第一阶段不新增任务表，不复制 `tasks.md`；如需缓存，仅保存可丢弃的读取快照和新鲜度信息。
- 依赖：运行时继续使用已安装的 OpenSpec CLI，不新增前端 Markdown 解析依赖。
- 非目标：本变更不负责自动执行任务、不直接勾选任务、不归档 change，也不替代 `session-autopilot` 的运行监督状态机。

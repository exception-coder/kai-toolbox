## Why

Vibe Coding 当前把服务端接口影响作为独立会话页签展示，和 OpenSpec change 的需求、任务与验收上下文割裂，也容易让用户误以为接口台账是另一套设计来源。接口登记仍是必要的运行证据，但它应归属于触发该实现的 OpenSpec change。

## What Changes

- 移除 Vibe Coding 会话顶部的“涉及接口”页签和独立接口工作区。
- 将受影响 HTTP 接口、变更类型、源码位置和验证状态展示在 OpenSpec change 详情中。
- 仅聚合与当前项目、change 和受监督会话时间范围一致的接口登记，避免跨 change 污染。
- 保留 Forge 的接口登记服务和 Agent Tool，作为 OpenSpec 的自动证据来源；不再把它暴露为独立设计入口。
- 保持 OpenSpec tasks 为完成事实的唯一权威，接口验证状态只用于发布证据，不改变任务完成状态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-task-board`: 在 change 详情中展示按绑定上下文归集的接口影响与验证证据，并提供明确的空状态。

## Impact

- 前端：`claude-chat` 删除独立页签、接口轮询和工作区；`openspec-board` 扩展 change 详情检查器。
- 后端：OpenSpec 看板只读投影新增接口影响字段，并通过会话自动监督绑定关联既有接口台账。
- API：`GET /api/claude-chat/openspec/boards/{projectId}/changes/{changeId}` 响应新增 `affectedApis` 字段；原接口登记端点继续兼容。
- 数据库：不新增表或列，继续读取现有 `claude_chat_session_affected_api` 与 `claude_chat_autopilot_run`。
- 非目标：不解析自然语言生成接口列表，不让看板直接编辑或验证接口，不删除 Forge 内部登记能力。

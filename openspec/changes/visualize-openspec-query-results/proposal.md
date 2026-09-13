## Why

用户无法从现有五列看板理解已完成什么、还差什么。官方 OpenSpec JSON 已提供任务和材料状态，应直接可视化查询结果。

## What Changes

- 用完整任务列表、剩余/完成筛选和进度摘要呈现官方任务结果。
- 将官方 status 和 apply 返回的材料状态、缺失前置项投影到详情。
- 明确 OpenSpec 勾选与实际运行证据的区别，保留刷新和过期提示。

## Capabilities

### New Capabilities

### Modified Capabilities

- `openspec-task-board`: 增加指令结果的可读进度及材料缺口展示。

## Impact

OpenSpecBoardService、ChangeDetail 和 openspec-board 前端。详情 GET 增加 workflow 字段，无 SQL、写入 OpenSpec 或新依赖。已核对官方 agent-contract 和本机 1.6.0 输出；现有主规格和 merge-affected-apis 变更不覆盖本次可读性需求。

## Why

开发者需要在原聊天轮次里核对实际用于独立代码审查的引擎、模型和结果。

## What Changes

- 在开发会话的原工具调用位置展示独立审查状态及展开详情。
- Team Standards CLI 可输出版本化活动摘要，现有审查执行和本机历史继续独立管理。

## Capabilities

### New Capabilities

- `cross-engine-review-activity` 把独立审查回执投影为聊天活动。

## Impact

- Forge 聊天列表读取已有工具活动及原生历史。
- 旧插件终态可使用已有 JSON 结果。新版插件提供实时阶段。

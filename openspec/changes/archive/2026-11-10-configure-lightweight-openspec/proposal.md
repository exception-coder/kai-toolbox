# 日常需求文档减负

## Why

仅精简附加规则仍保留默认四份产物链，日常小需求容易被扩写成完整模块设计。改为项目自有大纲与真实依赖，保留必要行为和验收。

## What Changes

- 新 Change 默认采用 forge-lite 的提案、行为增量、任务；设计按实际风险补充，旧 Change 固定原 schema。
- 升级本机 OpenSpec 至 1.15.0，验证新旧 JSON 命令兼容并补齐旧减负 Change 遗漏的原场景。

## Capabilities

### New Capabilities

- `openspec-planning`: 项目规划文档的大纲、条件设计与历史 schema 兼容。

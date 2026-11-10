# 规划文档行为增量

## Purpose

管理 Forge 项目规划文档的默认大纲、按需设计和历史兼容，让日常需求保持简短，同时保留必要行为规格、可追踪任务与实际验收边界。

## ADDED Requirements

### Requirement: 新变更采用项目简版大纲

项目 SHALL 默认以 forge-lite 生成简短提案、行为增量和编号任务，不强制设计 artifact。实际设计风险或 UI/AI 工作流需要设计时，Agent MUST 补充简短设计或引用适用的现有依据，不因精简删除必要验收。

#### Scenario: 日常行为变化

- **WHEN** 新 Change 的 proposal、delta specs 和 tasks 完整且不存在需补设计的风险
- **THEN** CLI 允许进入 apply，不要求 design.md，任务仍按原编号和勾选状态跟踪

#### Scenario: 必要规划材料缺失

- **WHEN** 未声明跳过规格的新 Change 缺少 proposal、delta specs 或 tasks
- **THEN** CLI 返回规划缺口，apply 不得将其当作完整就绪

#### Scenario: 复杂需求需要设计

- **WHEN** Agent 识别到实际架构、契约、安全或迁移等设计风险
- **THEN** 先补充或引用设计再实施相关部分，apply 指令要求读取已有 design.md

### Requirement: 无行为变化可以显式跳过规格

无规格行为变化但确需跟踪的 Change MAY 声明 skip_specs；系统 MUST 保留提案、任务、严格校验和适用验收，不虚构需求以满足格式。

#### Scenario: 工具或文档工作

- **WHEN** Change 显式设置 skip_specs=true 且没有 delta specs
- **THEN** CLI 将规格标为 skipped，按保留的提案与任务处理 apply 和校验

### Requirement: 模板选择保持历史边界

项目 MUST 将大纲与依赖保存在可版本化 schema 中，并保留旧活动 Change 的原 schema，不通过升级或切换默认值重写其正文与任务。

#### Scenario: 切换项目默认 schema

- **WHEN** 默认值切换到 forge-lite
- **THEN** 既有显式绑定及补齐旧绑定的 Change 继续使用原 schema，新建 Change 使用 forge-lite

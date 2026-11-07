---
id: kai-toolbox-ai-secretary-capture-flow
project: kai-toolbox
module: ai-secretary
title: 记录态：自由文本到结构化落库的编排流程
type: flow
stability: draft
tags: [记录态, 结构化抽取, 降级兜底, 确定性护栏]
related: [kai-toolbox-ai-secretary-needs-review-rule, kai-toolbox-ai-secretary-expense-todo-rule, kai-toolbox-ai-secretary-memory-lifecycle]
summary: 秘书"记录态"把用户随手输入的自由文本，经 LLM 结构化抽取 + 代码侧确定性护栏、降级兜底后落库为一条或多条记录，并异步提炼长期记忆。
---

> ⚠️ 草拟骨架：内容为占位，**必须由该模块业务 owner 用真实口径替换后再改 stability: stable**。

## 业务定义

```mermaid
flowchart LR
  A[自由文本输入] --> B[LLM 结构化抽取: 拆条/分类/字段]
  B --> C{解析成功?}
  C -- 否 --> F[降级为一条未分类记录]
  C -- 是 --> D[确定性护栏: 时间归一化 + 金额兜底]
  D --> E[落库 + 建检索索引]
  F --> E
  E --> G[异步: 提炼长期记忆(不阻塞响应)]
```

阶段说明：

1. **输入**：用户输入一段自由文本（可带附件）。
2. **结构化抽取**：LLM 依据当前时间上下文与已确认的长期记忆背景，把文本解析成若干条候选记录（每条含分类、标题、到期时间、金额、标签、置信度）；只有明显是多件互不相关的事才拆成多条，同一件事的多个字段一律算一条，不得拆开。
3. **确定性护栏**（代码侧对 LLM 输出逐条校验/兜底，不完全信任模型的原始判断）：
   - 到期时间：校验并归一化 LLM 给出的时间表达；解析不了就丢弃该字段并标记待复核（见 needs-review-rule）。
   - 金额：分类为"开销"但模型没给出金额时，从原文按规则再兜底抽取一次（见 expense-todo-rule）。
4. **降级兜底**：LLM 调用整体失败，或返回内容无法解析为结构化数据时，不丢弃用户输入——整条原文降级为一条"未分类"记录。
5. **落库**：把校验/兜底后的记录写入数据库，并建立检索索引，供"回忆态"检索使用。
6. **异步长期记忆提炼**：记录落库后，不阻塞响应地把原文异步交给长期记忆提议流程，尝试提炼画像候选（见 memory-lifecycle）。

## 适用范围 / 边界

仅适用于"记录态"（捕获/记笔记）场景；"回忆态"（问答查询）走另一条独立流程（见 recall-flow）。纯附件（无文本）走单独的兜底通道，直接建一条笔记承载附件，不经过 LLM 结构化抽取这一步。

## 备注

kai-toolbox 代码调研起草，待 owner 核实。

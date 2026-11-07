---
id: kai-toolbox-ai-secretary-needs-review-rule
project: kai-toolbox
module: ai-secretary
title: 待复核(needsReview)触发条件
type: rule
stability: draft
tags: [needsReview, 置信度阈值, 待复核]
related: [kai-toolbox-ai-secretary-capture-flow, kai-toolbox-ai-secretary-expense-todo-rule]
summary: 记录抽取的置信度低于阈值、分类落在未分类、或到期时间解析失败，三者任一命中即标记该记录为待复核。
---

> ⚠️ 草拟骨架：内容为占位，**必须由该模块业务 owner 用真实口径替换后再改 stability: stable**。

## 业务定义

秘书为每条记录抽取的字段可能不可靠，需要一个"是否需要用户复核"的判定，供前端提示用户去确认/修正。以下任一条件满足即标记为**待复核**：

1. 分类/抽取的置信度低于 0.6（0~1 区间，由 LLM 给出）；
2. 记录未能归入任何已知类目，落在"未分类"；
3. 记录本身带有到期时间的表达，但代码侧未能把 LLM 给出的到期时间解析/归一化为合法时间（说明时间表达有误或格式无法识别），该字段被丢弃。

以上三者只要命中一条，整条记录即标记为待复核；命中多条也只是同一个待复核标记，不做程度区分。

## 适用范围 / 边界

该判定只发生在"记录态"结构化抽取成功、走完确定性护栏之后（见 capture-flow）。如果整体抽取失败降级为"未分类"记录，也会自然落入第 2 条而计入待复核，行为一致。用户手动新增/编辑的记录不经过这套判定，视为已确认，不标待复核。

## 备注

kai-toolbox 代码调研起草，待 owner 核实；置信度阈值（0.6）具体数值以现网配置/代码为准，属于可调业务口径，此处按调研时代码取值记录。

---
id: kai-toolbox-impl-ddl-baseline-guide
project: kai-toolbox
module: impl
title: DDL 基线导引（字段/表结构权威源）
type: reference
stability: stable
tags: [DDL, schema, SQLite, 表结构, 字段, 建表, ddl-baseline, toolbox.db, 数据库, 字段名]
related: []
summary: kai-toolbox 当前运行库的完整 DDL 基线（112 张业务表、169 个显式索引）在本目录 ddl-baseline.md；写 SQL 前按表名检索核对字段。
---

> 写或修改 SQL、DAO、Repository、schema migration 前，先核对真实 DDL。

## 全量 DDL 基线

- 文件：`docs/domain/impl/ddl-baseline.md`（**112 张业务表、169 个显式索引**）。
- 基线来自当前运行库 `C:\Users\zhang\.kai-toolbox\toolbox.db` 的 `sqlite_master` 只读快照，不是从实体类反推。
- 在本项目内按表名检索快照，例如：
  `rg -n -A 40 '^## ai_chat_message$' docs/domain/impl/ddl-baseline.md`
- schema 变化后，核对项目迁移脚本和只读实际 Schema，按需更新本地快照，并同步更新本卡中的统计数字。

## 使用边界

- DDL 是字段名、类型、默认值、主键、约束和索引的实现权威源。
- 业务语义仍以对应模块的 flow/state/rule/concept 卡片为准；不要只凭字段名推断业务口径。
- `DDL_MISSING` 表示知识库缺少可追溯 schema 基线，不表示当前需求必须新增迁移 SQL。

## 权威与维护

当前结构以本项目迁移脚本与只读实际 Schema 为准。相邻 `ddl-baseline.md` 是有日期的历史快照；业务语义随本项目文档维护，仅保留一份正文。

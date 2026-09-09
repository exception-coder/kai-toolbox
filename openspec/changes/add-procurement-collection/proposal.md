# 招采信息采集

## Why

将用户提供的管材招采站点与关键词 Excel 转为可持续使用的 Forge 工作区，支持真实采集、证据回查和规则维护。用户已确认“招聘”指“招采”。

## What Changes

- 导入 8 个站点、60 条公告来源和关键词表的四类规则，保留 Excel 来源，不把历史采集标成新采集。
- 增加概览、采集结果、站点管理、关键词管理工作区，采用用户参考图的左导航与右主体布局。
- 支持按站点采集已有来源、添加公告 URL、失败重试、查看原文与结构化结果。
- 代码负责格式归一、去重与数值候选提取；统一 LLM 网关负责章节、共现、对象关系和分类，输出必须具有可验证原文证据。
- 管理规则的增改、启停与删除；解析任务保存规则快照，后续修改只影响新解析。
- 将新增工作簿“销售判断候选”47 列初始化为版本化数据结构；在 Forge 维护字段分组、名称、类型、说明与提取方式，公告支持独立人工修正与恢复自动值。

## Capabilities

### New Capabilities

- `procurement-collection`: 招采站点、公告采集、规则管理与证据解析。

### Modified Capabilities

无。

## Impact

新增 tools/tool-procurement、frontend/src/features/procurement，父 POM 与 starter 注册模块。复用 toolbox-llm；模块独立 SQLite 表。采集使用 Patchright，遵循公开站点重定向与 iframe 结构，限制并发与超时。来源是两份用户 Excel、参考截图与当前项目源码；不新增销售评分、项目合并、定时任务或独立 LLM 凭据。

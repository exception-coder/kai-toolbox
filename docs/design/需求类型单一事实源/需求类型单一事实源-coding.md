# 需求类型单一事实源编码摘要

## 实施切片

1. 在 `toolbox-common` 定义枚举、解析结果和端口。
2. 让 `PrdRequirementTypeResolver` 实现端口，严格校验不可信模型输出。
3. 在需求池新增应用服务，负责独立条目的解析和字段赋值。
4. 扩展 `req_pool_item`、领域对象、Repository 与 `ReqItemView`。
5. PRD 镜像同步直接采用会话类型，并记录 `PRD_SESSION` 来源。
6. 删除 `factQuality.ts` 的关键词分类；`UNKNOWN` 不获得新增模块豁免。

## 约束

- 禁止 `tool-reqpool` 依赖 `tool-prd-clarify` 包。
- 禁止前端从文本推断需求类型。
- 禁止把非法/缺失类型默认为 `NEW_MODULE` 写入需求池。
- 模型输出必须经过枚举白名单和置信度边界校验。
- 数据库修改仅做 additive migration。

## 完成定义

- 后端编译和相关测试通过。
- 前端单测、类型检查与生产构建通过。
- 反向索引包含新枚举、字段和 API 读写点。
- 设计索引状态更新为“已实现”。

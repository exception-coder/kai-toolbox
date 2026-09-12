## Context

Graphify 定位 ReqPoolPage、DeliveryCenterPage 和 public-api；当前源码确认 reqpool 已读取 delivery-overview，按 prdSessionId 关联。两份列表分别面向需求条目与 PRD 会话，不能简单删除任意一份。用户批准交付中心视觉，覆盖此前主看板方向。

## Goals / Non-Goals

目标：一个菜单、一个项目筛选和需求集合，保留现有业务能力，沿用交付中心轨道与 Inspector。非目标：数据库合并、自动登记、状态迁移、权限扩张、新依赖。

## Decisions

- 在 reqpool 编排现有命令与窗口，新增纯投影和视图组件。delivery-center 通过 public-api 提供轨道、Inspector、飞书起草能力，不反向依赖 reqpool。
- 单一菜单名称 AI 交付中心，保留 feature id reqpool 和 menu:reqpool；旧 delivery-center manifest 隐藏，旧路径在 reqpool manifest 注册为保留查询参数的 replace 跳转。原仅有 delivery-center 权限的用户需管理员授予现有 reqpool 权限，不自动扩权。
- 每个需求条目用 req:<id> 作界面身份，通过 prdSessionId 关联证据；未关联条目仍可见；未被条目引用的 PRD 用 prd:<id> 显示并提供打开和同步入口。多个真实条目引用同一 PRD 时保留各条目，不静默吞数据。
- 三栏为项目空间、模块分组的需求轨道、选中条目的管理与证据。小屏顺序排列，轨道局部滚动。所有阶段点击复用真实阶段窗口，负责人、期限、分析及文档操作复用已有实现。
- 主菜单的登记入口包含快速登记、标准起草、飞书导入。全局项目汇总与项目筛选共享同一界面，不再保留第二套全局看板。
- 数据源独立失败时保留可用数据并提示重试，不把无证据转换成 0% 或完成。筛选后选中项回到可见集合，删除、创建后由既有 query invalidation 刷新。

## Risks / Trade-offs

未登记 PRD 和未绑定需求是不同对象，仅在明确关联后合并展示。全选只覆盖可见且真实登记的需求，不给 PRD 合成删除 ID。子需求保留父项提示及原详情关系能力。

## Migration Plan

修改 ReqPoolPage 主展示和两个 manifest；复用 useReqpoolItemCommands/useReqpoolDocumentWorkflow；新增 unifiedDeliveryModel、UnifiedDeliveryWorkspace、统一登记窗口。更新生成菜单、探索文案。无数据迁移；回滚本次提交即可恢复旧界面。保留旧模块的工具组件和已有测试。

## Verification

投影测试覆盖空、未绑定、已绑定去重、未登记 PRD、多条目关联和过滤；页面测试覆盖管理、阶段、筛选、空态及失败；typecheck/build/既有相关测试/Forge/桌面移动浏览器。路由兼容使用项目 React Router，参考 [Navigate](https://reactrouter.com/api/components/Navigate) 的 replace 语义，无版本升级。

## Open Questions

无阻断业务决策。API 与数据库规则保持现状；本轮不声明后台已重启。

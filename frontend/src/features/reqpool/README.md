# AI 交付中心

入口 `/tools/reqpool`。统一使用原交付中心的项目空间、需求轨道和证据检查器，原需求中枢的登记、负责人、期限、分析、文档、执行与删除继续使用既有接口。

## 使用方式

1. 左侧选择项目，或在全部项目中搜索需求、模块和负责人。
2. 中间按项目/模块查看需求轨道；点击需求在右侧显示管理信息与证据。
   “交付证据汇总”保留原有进度、健康度、风险与评估覆盖统计，统计范围明确为全部项目的 PRD 集合。
3. 点击“管理需求与执行”打开原有需求详情；点击阶段节点进入规格、方案、代码、测试或运行证据。
4. “登记需求”统一提供快速登记、标准起草和飞书导入；“更多”保留优先级分析与页面调整。
5. 勾选已登记需求后可全选当前筛选、取消选择或批量删除，继续使用原有删除确认。未登记 PRD 不参与需求批量删除。

## 数据与兼容

- `unifiedDeliveryModel.ts` 只做展示投影，不创建或修改业务记录。需求通过 `prdSessionId` 关联交付证据，明确关联的 PRD 不重复显示。
- 未关联 PRD 的需求仍可管理；未被任何需求引用的 PRD 单独显示，并可通过原幂等同步接口登记。多个真实需求指向同一 PRD 时保留各需求，不自行合并数据。
- 原交付页的独立布局已移除，能力通过 delivery-center 的 `public-api` 复用；旧 `/tools/delivery-center` 保留查询参数、hash 和 history state，replace 跳转到统一入口。
- 单一菜单沿用 `reqpool` 身份与 `menu:reqpool` 权限，生成目录由 manifest 更新。原仅有 `menu:delivery-center` 的用户需要管理员授予现有 `menu:reqpool`，本次不自动扩大权限。
- 数据源分别加载。证据失败时保留需求；需求源失败时 PRD 的登记状态标为待核实，并禁用同步登记。缺少证据不伪造进度。
- 两套列表、独立全局看板与旧看板字段配置退出主流程，统一用项目筛选和单一轨道阅读；旧偏好数据未删除。

## 维护与验证

`ReqPoolPage` 保留既有命令和窗口编排；`UnifiedDeliveryWorkspace` 管理筛选与选中项；`UnifiedDeliveryMap` 展示轨道；`UnifiedRequirementInspector` 接入管理信息。飞书字段转换由 delivery-center 的 `lib/feishuBusinessFields.ts` 维护。

测试命令：`npx vitest run src/features/reqpool src/features/delivery-center src/features/forge-explore/ExplorePage.test.tsx`，以及 `npm run typecheck`、`npm run build`。本次浏览器使用真实页面与拦截的契约样本，覆盖混合需求、阶段窗口、管理详情、快速起草、筛选、数据源失败和重试、1440/375 布局；未执行真实登记、删除或模型调用。

设计依据：[统一交付中心变更](../../../../openspec/changes/unify-requirement-delivery-center/design.md)。本次视觉偏好仅适用于该模块，未提升为全局设计规则。

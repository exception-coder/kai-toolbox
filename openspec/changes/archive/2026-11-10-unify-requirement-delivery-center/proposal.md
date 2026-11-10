## Why

AI 需求中枢与 AI 交付中心重复提供需求入口、列表和交付展示。用户明确偏好交付中心的布局，要求以其视觉基础合并功能并化繁为简。

## What Changes

- 单一菜单使用 AI 交付中心名称，保留 reqpool 身份与权限，旧交付地址兼容跳转。
- 用项目、需求轨道、证据三栏替换需求中枢主看板，复用既有命令和详情。
- 登记、标准起草和飞书导入收敛到一个入口；未关联 PRD 的需求和未登记 PRD 均可见。
- 保留负责人、期限、分析、文档、开发、验证和删除能力，明确数据缺失与接口失败。

## Capabilities

### New Capabilities

- `unified-delivery-center`: 单一需求交付入口及完整数据投影。

### Modified Capabilities

无主规格修改。本变更替代活动 redesign-ai-requirement-hub-board 的主看板视觉方向，保留其业务动作与生命周期语义。

## Impact

前端 reqpool、delivery-center、菜单权限生成目录及导航引用。不修改后端接口、数据库、需求状态机或权限授予。需要浏览器验证旧地址、空态、失败、窄屏和操作入口。

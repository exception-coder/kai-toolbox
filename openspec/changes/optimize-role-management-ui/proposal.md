## Why

角色管理当前以紧凑表格和行内表单承载全部操作，角色状态、内置保护、权限规模与编辑上下文不够易扫读，移动端也依赖横向表格。需要在保持现有 API 和授权规则不变的前提下，提高日常角色维护的效率、可发现性和状态恢复能力。

## What Changes

- 重构角色列表的信息层级，明确角色身份、状态、数据范围、权限数量与操作入口。
- 将新建/编辑表单改为结构化编辑区，补齐标签、说明、校验反馈和保存状态。
- 为加载、空列表和请求失败提供保留工作流上下文的反馈与恢复动作。
- 优化窄屏布局与键盘/焦点可用性，保持桌面端舒适的信息密度。
- 延续现有权限浏览器的三栏工作台模式，统一角色列表与权限配置的视觉语言。

## Capabilities

### New Capabilities

- `role-management-workspace`: 角色列表、角色编辑及进入权限配置工作流的可观察界面行为。

### Modified Capabilities

<!-- 无现有 capability 的需求发生变化。 -->

## Impact

- 前端：`frontend/src/features/forge-role/pages/RolePage.tsx`，必要时复用同 feature 的 `PermissionExplorer.tsx` 和现有 UI primitives。
- 接口：继续使用现有 `/forge/roles` 相关 API，不新增或修改服务端 HTTP 契约。
- 数据：不修改数据库结构，不产生人工执行 SQL。
- 依赖：不引入新包，不跨 feature 引用内部实现。

## Evidence and Decisions

- 当前实现依据：Graphify 的 `RolePage()` / `PermissionExplorer()` 坐标，并通过定向读取源码复核；当前工作区存在大量其他未提交改动，本变更只触碰 forge-role 与对应 OpenSpec artifacts。
- 设计依据：项目现有语义色彩、按钮与确认对话框，设计注册表 global core，以及 Quiet Luxury Enterprise UI 约束。
- 非目标：不改变角色业务规则、内置角色保护、权限父子联动或后端返回结构。
- 未决事项：无高风险业务决策。

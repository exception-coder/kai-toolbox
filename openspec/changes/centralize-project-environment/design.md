## Context

ProjectRegistryPage 提供区域导航；ForgeEnvironmentPage 已实现检测、初始化和套件维护。项目详情 environment 标签展示画像及环境地址。

## Goals / Non-Goals

集中入口，清楚区分全局与项目范围，保留现有操作和权限。此切片不添加版本继承/覆盖配置模型。

## Decisions

通过 forge-environment/public-api 暴露权限保护的嵌入组件，避免跨 feature 私有导入。保留旧 manifest 的权限码及 chrome 路由，旧 URL replace 到项目库 environment 区域并保留查询参数。项目库本身权限与原环境权限同时生效。

## Risks / Trade-offs

全局操作可能影响多个项目，页面明示本机范围；不假定能精确枚举影响项目。未授权用户不能挂载环境查询组件。嵌入布局去掉重复主标题与外层留白。

## Migration Plan

不迁移数据。验证旧链接参数、权限拒绝、嵌入组件及原环境专项测试；typecheck/build、Forge 门禁、实际前后端运行与稳定观察。视觉访问之前被拒绝，保持未验证。回滚入口文件即可恢复旧菜单。

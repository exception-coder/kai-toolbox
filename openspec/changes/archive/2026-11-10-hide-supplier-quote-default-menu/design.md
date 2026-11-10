## Context

当前 `frontend/src/shell/menuVisibility.ts` 从全部非 chrome manifest 派生默认集合，侧栏与首页复用该集合。`featureRegistry.ts` 的 hidden 会删除路由，不适合默认隐藏需求。当前工作区有并行菜单迁移改动，按块隔离提交。

## Goals / Non-Goals

默认隐藏供应商报价 H5，保留偏好设置恢复入口、已有用户选择和直接访问。无权限、后端或页面布局调整。

## Decisions

FeatureManifest 增加可选 defaultVisible，仅显式 false 被默认集合排除；供应商报价声明 false。继续使用现有存储、恢复默认及菜单组件，不增加配置来源。

适用 DENS-01、NAV-01、CTX-01、EVID-01：主对象为 supplier-quote-h5，复用菜单偏好，减少默认入口，不增加导航层级。加载与保存反馈沿用偏好设置；无新异步状态、草稿或覆盖层。键盘和窄屏沿用现有控件，验证默认集合、恢复开启和路由保留。

## Risks / Trade-offs

已有显式可见配置继续优先，避免覆盖用户选择。默认隐藏不是禁止访问。

## Migration Plan

无需数据迁移。前端构建、质量门禁及运行观察验证；回滚本次 manifest 与默认集合修改即可。

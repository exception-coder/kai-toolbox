## Context

FeatureRegistry 从 features/*/index.tsx 收集菜单和路由；两个 SupplierQuote*ForgeProperties 通过 @Refreshable 注册配置目录。toolbox-starter/pom.xml 直接引入共享 Starter。wyoooni-application 的 Maven 构建仍调用 h5:build，不能删除共享实现。

## Goals / Non-Goals

移除 Forge 的供应商报价可见能力及后端装配。独立 Wyoooni 报价应用与已有数据不在本次移除范围。

## Decisions

删除 H5 index.tsx、toolbox-entry.tsx、两个宿主配置类及原宿主报价集成测试；删除宿主 Starter 依赖、supplier-quote.yml 导入/文件和报价匿名路径。保留根 reactor 的共享模块及独立 H5 构建。更新 H5 说明，表明只用于独立应用。

适用 NAV-01、CTX-01、DENS-01、EVID-01。主对象是 Forge 模块 supplier-quote-h5；移除注册源后侧栏、首页、偏好设置同步消失。旧链接使用现有未找到页面及返回首页路径；无新增覆盖层、草稿或异步操作。浏览器验证设置目录与旧链接，沿用现有键盘和窄屏恢复。无设计例外。

## Risks / Trade-offs

运行验收发现旧接口抛出 NoResourceFoundException，却被 GlobalExceptionHandler.handleAny 转成 500（2026-09-17 01:45:58 UTC 当次日志）。在现有公共 HTTP 异常适配层补充该异常的 404 映射，不添加报价专属路由；MockMvc 回归覆盖缺失资源和正常接口，保持其它异常处理不变。这是移除后旧入口恢复语义的验收修正。

- 增量编译可能残留已删除配置类 → 完整宿主 clean package，检查 Jar 并重启目标进程。
- 旧菜单偏好仍有 ID → 注册表不含目标模块，偏好不能使其重新出现。
- 误删共享 H5 破坏独立应用 → 保留共享源码，执行 h5:build。
- 留存历史数据 → 不产生迁移、不改库；删除能力不代表清除数据。

## Migration Plan

前端 typecheck/build、H5 独立 build、完整宿主构建；Forge all 门禁。按 dev 模式端口 18080 与实际前端端口验收配置目录、菜单与路由，再连续观察至少 60 秒进程及 HTTP。回滚通过还原本次提交并重新构建启动，无数据恢复需求。

## Review

Agent 自审：与旧默认隐藏 change 目标不同，建立独立变更；既有主规格没有该能力正文。没有新增业务逻辑、SQL 或外部依赖。实现完成后以测试和运行事实核对，本段不代表已通过验收。

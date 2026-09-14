## Context

基线 76d7da56。ProjectScanner 与 WorkspaceScanService 各自扫描；ProjectRouteBindingService.list 先插入托管占位再跳过同名真实目录。GitWorkspaceChanges 平铺路径。Graphify 查询提供候选，以上事实已定向读取当前源码确认。

## Goals / Non-Goals

统一项目发现与使用政策，保留登记身份；树形展示真实文件归属。不增加基础数据微服务、通用表或提交/勾选功能。

## Decisions

### 项目目录领域

tool-projects 提供 ProjectCatalog 公共端口实现；统一扫描一级目录、合并登记路径、返回稳定路径键及 registry ID。注册项目名称优先，别名作为展示兼容。common 只持有契约。ProjectAccess 独立于扫描器，由项目配置实现，避免循环依赖。

管理 GET /api/project-catalog?includeExcluded=true 可见所有候选及排除状态；普通查询只返回可使用候选。PUT /api/project-catalog/visibility 按完整路径切换策略。排除列表复用 DynamicConfigService 持久化，无新 DDL。每次使用检查最新策略，旧快照不能绕过排除。排除作用于路径及后代；历史不删除，已在执行的任务不强行中断。

兼容 workspaces/projects 响应从公共清单投影，移除独立扫描；业务路由不再自动注入未落地模板。显式绑定优先但必须服从使用政策，同名目录冲突明确报告。Registry 与资源身份出口同步过滤；源码加载守卫复用 ProjectAccess。

### Git 层级

纯函数构建目录树并压缩单子目录；叶子保留原始路径、重命名来源和双状态。使用原生 details/summary 提供键盘折叠，每个目录稳定路径键；刷新保留展开状态。统计为变更条目，未跟踪目录不伪称准确文件数量。无提交选择含义，故不加复选框。

### 产品原则

OBJ-01 / AI-01：单一项目目录与政策，页面和 AI 共用。NAV-01：目录管理留项目库目录设置；Git 留当前项目弹框。CTX-01：刷新保留展开与搜索。DENS-01：单链目录压缩。FEED-01 / CTRL-01：排除可恢复，错误保留上下文并重试。EVID-01：不可访问、未登记与排除分别表达。移动端名称换行、状态紧凑；键盘 summary 可操作。无原则例外。

## Risks / Trade-offs

- 同名目录不能靠名字猜测 → 路由歧义拒绝，管理按路径区分。
- 项目仍有旧缓存 → 返回时应用实时政策，配置后失效前端查询。
- 符号链接别名 → 路径比较兼顾规范化与真实路径；Windows 不区分大小写，POSIX 保留大小写。
- 不强行停止运行中任务 → 后续读取和执行请求受新策略约束。

## Verification and migration

回归覆盖真实目录不被模板遮挡、登记路径合并、排除/恢复/直接路径、目录树折叠及状态。前端 typecheck/build，后端专项与宿主构建，Forge 门禁、桌面/窄屏检查和 60 秒运行观察。默认排除为空，数据不迁移；回滚源码即可恢复旧入口，保留配置与历史。

## References

- [Spring 模块公开边界](https://docs.spring.io/spring-modulith/reference/fundamentals.html)
- [Backstage 系统与资源模型](https://backstage.io/docs/features/software-catalog/system-model/)

仅借鉴领域职责与公开契约，不引入对应依赖。Agent 自审，非独立人工评审。

## 1. 实施

- [x] 1.1 移除 Forge H5 注册和宿主接线，保留独立构建并更新说明。
- [x] 1.2 移除宿主配置目录、Starter 依赖、配置导入及对应专用测试。
- [x] 1.3 修复缺失资源异常错误映射为 500，并验证 HTTP 404 与正常接口回归。

## 2. 验证与交付

- [x] 2.1 前端 typecheck/build、菜单相关测试、独立 h5:build；确认旧偏好无法恢复入口。
- [x] 2.2 完整宿主 clean package 与制品检查，重启 dev 目标版本并验证配置和旧 API。
- [ ] 2.3 Forge all 门禁、浏览器菜单及旧路由验收，连续观察至少 60 秒。
- [x] 2.4 更新真实验证证据，校验 OpenSpec 与文档，核对本次提交范围。

## 验证记录

- 前端 typecheck/build 退出码 0；7 个测试文件、28 项测试通过，独立 h5:build 通过。生产 JS 不含报价 H5 菜单或宿主入口。MenuVisibilitySection 与 useVisibleFeatures 只消费注册表，旧偏好 ID 无法产生已移除的 manifest。
- 首次使用终端默认旧 JDK 构建失败，改用运行管理器配置的 JDK 21 后，41 模块 clean package 成功。Jar 中无 supplier-quote 依赖、配置类、配置文件和入口 chunk；内嵌 index.html 与本次前端构建一致。
- ModuleDependencyArchitectureTest 1 项通过。真实 MVC 的 GlobalExceptionHandlerTest 1 项通过：缺失资源返回 404，正常接口返回 200。
- 浏览器验收未执行：浏览器权限检查拒绝访问 https://localhost:5173，理由为用户未授予权限。未尝试其它浏览器或自动化绕过；2.3 的浏览器子项保持未完成，构建与接口证据不冒充视觉验收。
- 原始构建/运行日志保留在本地 .codex-work/supplier-quote-*，不纳入 Git。未改数据库数据或 Wyoooni 应用源码。
- 最终 41 模块 package 与两项后端测试通过；启动日志 2026-09-16 18:53:06 -07:00 显示目标应用启动成功，无致命启动异常。dev 后端 18080、前端 5173，基线 bbcb7b50 加本次暂存变更。
- 最终 Forge all 退出码 0，status/staticStatus/runtimeStatus 均 PASSED；实际执行 9 个 API-RUNTIME-001 场景，executedCheckers 为空，不声明运行了静态 Checker。
- 2026-09-17 01:55:28 至 01:56:28 UTC 三次采样：后端 PID 64420、前端 PID 2500 不变，重启次数均为 0；业务探测及配置目录均 HTTP 200，旧报价 API 与两个配置详情均 HTTP 404。2.3 的门禁与稳定观察已完成，仅浏览器子项因权限拒绝保留未完成，change 不归档。
- 用户补充约束：此后执行任何服务重启必须先取得用户明确确认；不得继续沿用仓库默认自动重启授权。

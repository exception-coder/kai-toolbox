## 1. 通用资源配置

- [x] 1.1 新增通用 APP 资源领域、SQLite 持久化、脱敏 CRUD 与多登录协议执行器。
- [x] 1.2 将通用 APP 注册为 ResourceProvider，并验证环境、能力、同源和凭据边界。
- [x] 1.3 优化系统资源页面，支持多个 APP/DB 源配置、绑定、测试及移动端恢复反馈。

## 2. Forge 动态工具收口

- [x] 2.1 普通 Claude/Codex 会话仅默认装配 Forge 资源工具，保留旧固定桥接兼容。
- [x] 2.2 更新能力展示、安全策略测试及架构说明，明确资源目录与 Tool 的边界。

## 3. 验证与交付

- [x] 3.1 通过 Java 专项测试、Sidecar 测试、前端测试/typecheck/build 和 OpenSpec strict validation。
- [x] 3.2 执行 Forge Quality Gate；不重启服务，运行验收留待用户逐次确认重启后执行。
- [x] 3.3 核对 diff、同步任务证据并原子提交。

验证证据：`tool-ops` 资源专项 11 项、前端资源交互 5 项、Sidecar 231 项、前端 typecheck/build、完整宿主 41 模块 package 均通过；OpenSpec strict validation 通过。Forge Static 为 PASSED/exit 0，但 `executedCheckers` 为空；Runtime 未执行。Sidecar 生产构建因 18890 正在服务而安全拒绝覆盖 dist，源码已用 `tsc --noEmit` 与完整测试验证。新版启动、页面视觉和运行态资源调用须在用户确认重启后验收。

## 4. 2026-10-17 连接测试反馈修复

- [x] 将进度、成功耗时及失败原因放在当前实例/编辑区，保留保存与测试边界、原实例 ID 和失败重试。
- [x] 验证编辑区反馈、列表行反馈、请求异常和切换实例时的延迟结果归属，保留既有密码留空保存用例。
- [x] 执行适用的 typecheck、规格及质量检查并提交，记录真实页面验证边界；不重启服务。

本轮证据：源码确认结果原先位于完整列表末端；新增回归在旧实现中复现编辑区和实例行内缺失反馈。修复后 `OpsPage.test.tsx` 5 项通过，包含连接失败响应、请求抛错、成功耗时、原 ID 测试且不隐式保存、切换实例后的延迟结果与既有空密码更新用例。`npm run typecheck`（含菜单目录及 Feature boundaries）退出 0，最终测试断言和耗时条件调整后 `npx tsc -b --noEmit` 复查退出 0。严格规格校验通过；Forge Quality JSON 为 PASSED/exit 0，`executedCheckers=[]`，只执行九项既有后端 API 探测，不代表前端视觉验收。本轮为局部前端反馈修复，没有更改依赖、构建配置或后端，未重复全量生产构建，未执行真实数据库连接测试或改变连接配置，无整体架构影响。线上页面读取受已保存的站点权限策略限制，尚未完成浏览器视觉验收；未重启服务或推送。

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

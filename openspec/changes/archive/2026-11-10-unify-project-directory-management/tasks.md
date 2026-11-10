## 1. 统一实现

- [x] 1.1 完整目录设置、旧入口跳转和提示迁移，通过前端回归。
- [x] 1.2 PRD 图谱和拓扑查询统一项目解析，通过后端专项测试。

## 2. 验证交付

- [x] 2.1 完成前端类型检查与构建、宿主构建和 Forge 门禁。
- [x] 2.2 实际浏览器验收、目标版本启动与至少 60 秒稳定观察。
- [x] 2.3 同步必要文档、工作日志并核对本任务提交范围。

## 验证记录

- 前端 19 项专项测试与 typecheck 通过；完整 npm build 通过，最后表单恢复调整后重新执行 typecheck 与 Vite 构建通过。
- 后端 ProjectContextResolutionTest 与 GraphifyQueryServiceTest 共 5 项通过；Forge 启动执行 42 模块宿主 Maven install 成功。首次直接 Maven 使用错误 JDK，改用项目 Java 21 后通过。
- Forge JSON status=PASSED、退出码 0；执行 9 项 API 运行检查。executedCheckers 为空，不宣称静态规则检查已执行。
- 实际浏览器确认旧链接跳转、配置中心移除重复块、原目录值完整、隐藏前缀/缓存/Git 超时显示、非法输入拒绝与纠正恢复。桌面及 390px 窄屏无横向溢出。
- 清理经身份核验的旧后端孤儿进程后，实际新 JVM PID 56824 于 21:19:18 启动，18080 后端、5173 前端和 3000 Studio 连续稳定观察 80.76 秒，6 个目录/项目接口持续 HTTP 200，配置摘要未变，日志无致命启动异常。
- 当前微信仍 waiting restart（4 次），Ollama 嵌入服务不可达，作为非本次目录功能依赖单列。未修改用户配置或源码目录。
- 本地证据：`.codex-work/directory-*`，不纳入提交。只提交本任务源码、规格和文档，不包含并行应用 OpenSpec、Graphify 增量同步改动。

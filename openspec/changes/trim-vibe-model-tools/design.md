# 工具边界收敛

采用 L3：改变模型可调用接口及旧执行兼容契约，仅维护本次增量。Team Standards 负责项目优先的方法、规格深度、设计与验证选择；OpenSpec/Graphify 继续保有行为和代码事实。Forge 的普通 SDK/stdio MCP 只注册 `discover_resources`、`execute_resource`、`prepare_sql_context`、`register_pending_sql`、`prepare_page_preview`、`report_session_progress` 六项。受限咨询保持原三项，不扩大权限。

移除 13 个执行操作和 6 个规格解析操作的模型注册及旧注册包装函数，删除要求模型先走 session/discover/assess 的公共服务器说明。保留同名内部 CLI/Hook 实现与状态格式，保障已绑定执行、范围锁、验证指纹、恢复和审计。此次不改变 gate 策略、关闭开关、删除绑定或自动释放 writer。原生权限拦截拒绝时提供实际 CLI 路径；`--describe <操作名>` 仅在旧流程需要时只读返回参数，不修改执行，不向每轮模型发布 schema。普通开发不因工具精简新增一次初始化或模型解析。

同步 Forge 自管自动推进 Skill 发布源及本地安装副本，分别升级原版本，明确普通方法归 Team Standards，旧执行只在已采用时通过兼容入口维护。Runtime 的任务绑定、队列、完成回执和重启授权不变；本轮不改全局 Team Standards 安装。

适用 DENS-01、AI-01、EVID-01、CTRL-01，无例外。SDK 使用内存 MCP transport，stdio 使用真实子进程检查完整工具清单及已移除名称拒绝；旧端到端测试迁至真实 CLI，复用范围、门禁和回执定向测试。Sidecar 运行中构建禁止替换 dist，使用独立目录编译；未授权重启，不把源码检查或隔离进程当作已运行服务验收。

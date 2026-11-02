# 实施与验证

- [x] 核实现有 SDK Adapter、本机 DSH 0.1.1-rc.2 及非空原生 Key；不输出凭据。
- [x] 对齐官方 SDK/Runtime，补齐启动、凭据、权限和持久会话边界。
- [x] 完成针对性测试、Sidecar 隔离构建及项目质量检查。
- [x] 专用工作目录验证多轮、文件修改、停止与恢复，记录真实结果和边界。
- [x] 核查 WorkBuddy 桌面自带 CLI 的调用与登录契约，区分外部 CodeBuddy。
- [x] 提交实现与验证记录。
- [ ] 新版服务生效与 Forge 端到端运行验收；须用户当次确认重启，未授权不执行。

Sidecar 整体 TypeScript 编译通过，4 个引擎/本地绑定文件共 27 项用例通过：覆盖目录隔离、原生恢复、凭据来源与清除、缺少终态/模型失败、超时、取消、审批归属及问题映射。Maven `-pl toolbox-starter -am test` 覆盖宿主及依赖模块编译，ProviderProfileServiceTest 7、SidecarProcessRegistryTest 8、EngineCatalogServiceTest 3 共 18 项通过，非指定测试没有执行。质量入口 exit 0、status=PASSED，executedCheckers 为空、9 项既有 API 通过；不是新引擎线上验收或安全审计证明。

最终按新后端相同的 KAI_DEEPSEEK_HARNESS_API_KEY 私有传递路径再次执行 active-stop 专项，receipt 后 500ms 中断与原会话恢复追加唯一验收行通过；普通进程环境不再保留该专用 Key。依赖从原 lock 增量更新，npm ls --depth=0 无 problems；未忽略 peer 冲突。保留上游 npm 审计提示，本次未执行全量安全审计，不称依赖安全检查通过。

原生 `.dsh` Key 真实调用返回 401 AUTH，未伪报成功、未修改旧凭据。另核对 Forge 全局官方 DeepSeek 档案与原生 Key 不同；已登记 Key 的官方模型目录返回 200，Flash 模型为 deepseek-flash。该 Key 仅注入隔离子进程执行真实验证：5 轮创建文件、继续追加、关闭进程后不读文件恢复对话标记、停止、恢复追加通过。另作输入 receipt 后 500ms 停止的专项，确认为 turn.interrupted 且无 completed，随后原会话追加文件通过。测试文件仅位于 `.run/deepseek-live-workspace`，未修改业务项目。

WorkBuddy 自带 CLI 使用专属产品配置且 tools 为空探测，返回 Authentication required /login；没有开放平台 secret 要求。未提取桌面 Token、未创建替代 CodeBuddy 适配，WorkBuddy 登录及完整编程会话尚未接通。

无人工数据库变更或待执行 SQL；全局档案只读复用，旧 Key 未覆盖。Forge 服务保持原进程，新 Java/Sidecar 尚未加载，不将隔离验证视作已上线。整体架构说明已同步原生凭据流、恢复及实际能力边界。

# 任务

- [x] 核实咨询无 Git 历史能力；核对官方 Git 参数与本机版本。
- [x] 实现有界、固定参数、本地文件 log/blame 查询及明确来源限制。
- [x] 登记能力、两引擎权限和默认流程；兼容已有源码权限的冻结流程，不改写快照。
- [x] Sidecar 编译通过；20 项定向测试通过，覆盖真实临时 Git 仓库、重命名、行归属、工作区/index/HEAD 不变、浅克隆、路径逃逸、父仓库、MCP 与两引擎装配。
- [x] JDK 21 下受影响模块及依赖编译成功，ConsultToolAssemblyProviderTest、ConsultWorkflowServiceTest、ConsultOrchestrationPipelineTest 共 13 例通过。
- [x] 项目质量门禁 JSON status=PASSED、退出码 0；executedCheckers 为空，9 个现有 API 场景通过，不代表本次真实咨询已验收。
- [ ] 用户确认重启后，用真实业务咨询验证源码定位、提交线索与联系人表述；当前未部署验收。

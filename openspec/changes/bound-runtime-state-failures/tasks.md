## 1. 本地修复

- [x] 1.1 实现持续状态故障的有界收口和恢复代次隔离。
- [x] 1.2 修复 Codex stdin 错误归属并验证关闭、异步异常和重放边界。
- [x] 1.3 完成后台回归、宿主装配、严格规格校验和适用质量检查。

## 2. 运行交接

- [ ] 2.1 [MANUAL_CONFIRMATION] 用户确认后加载新版本，验证原会话 d53c097d-bdd5-47cc-b4dc-516c38591089 的真实运行状态、故障恢复及推进结果。

## 验证记录

- 2026-10-07：后台 RuntimeProbeFailureGuardTest、SessionAutopilotServiceTest 共 28 项通过；验证持续故障暂停、进度保留、正常忙碌清零和代次隔离。toolbox-starter 完整 reactor package 成功。
- Sidecar TypeScript 编译通过；jsonLineWriter、Codex 启动重试共 12 项通过，覆盖异步断管、关闭流、晚到错误和已接收轮次不重放。新逻辑仅依赖 Node 内置 stream；其他任务的 SDK 依赖升级未包含在本次提交中。
- OpenSpec 严格校验通过；Forge Quality status=PASSED、exit=0。executedCheckers 为空；实际执行九项既有 API 探测通过，指向仍在运行的旧服务，不作为本次新逻辑的运行验收。
- 其他未提交质量框架、运行脚本不参与本次状态机和输入流定向测试。未重启、未取消或接管目标会话；原会话最新状态受访问限制，尚未证明恢复。

# Design

## Context and principles

控制点是 SessionAutopilotService.queueContinuation、AutopilotTurnHandoff 和 execution/verification.ts。Graphify 查询因图文件超过容量上限不可用，已直接核对上述源码。适用 AI-01（沿用权威上下文）、EVID-01（区分复用与执行）、CTRL-01（强制重验与失败保留）；无 UI 导航变更。

## Task batching

任务描述以 `[VERIFY_GROUP:name]` 标明共同的实现和验证边界，Agent 在现有设计中解释关联。Runtime 检查 change/revision、首个待执行任务 ID/序号和 APPLY 阶段，只投影从该任务起的连续同组任务，最多六项。遇到人工项或不同组结束；无标记兼容单任务。批次写入现有持久消息 instructions，当前 task 仍为进度锚点，回合结束由现有 Runner 重读 checklist 选择后续任务。保持预算、暂停、writer 及逐任务证据，不新增平行任务库。

## Evidence reuse

使用现有 execution.verification 内容指纹及 checkId。仅同执行、完整输入未变、相同命令/cwd/类别且已通过的 regression/spec/design 可复用；force 强制执行，失败和 API/SQL/UI 始终执行。保存阶段继续复核身份、输入和控制版本，防止执行过程中变化绑定错误证据。返回 executedCheckIds/reusedCheckIds，保留原始诊断与耗时。完整输入变化仍整体失效；不冒充逐测试依赖缓存。

## Verification and rollback

本地回归覆盖实际子进程计数、重复成功复用、失败修复、输入变化、强制和外部检查；Java 回归覆盖分组边界、人工项、版本漂移、上限及真实 handoff。宿主打包检查资源装配。不触发重启，目标版本加载及运行验收留到用户确认后。回退实现后忽略 VERIFY_GROUP 标记按单任务运行，已有勾选与证据不丢失。

## Local evidence (2026-10-07)

- TypeScript 全量类型编译通过；verificationReuse、lifecycle、verificationCommand 三组 31 项测试通过。复用测试用子进程写入计数验证相同调用只运行一次。
- 首轮 Java 定向回归 38 项通过（TaskBatch、TurnHandoff、ContinuousRunner、SessionAutopilotService）；同步安装器版本与资源后，最终 TaskBatch/TurnHandoff 5 项复核通过，包含新增资源版本一致性测试。
- 最终 Maven 宿主 package 成功；嵌入的 tool-claude-chat JAR 与已验证模块 SHA-256 一致，包含批次类和 Skill 1.0.10。Sidecar 使用独立输出目录完成编译及回归，未替换正在使用的 dist。
- OpenSpec strict validate 通过。项目 Forge CLI verify 返回 PASSED/exit 0，执行 9 项现有 API 探测；executedCheckers 为空，不宣称运行了静态 Checker，也不将旧进程 API 结果当作新版本验收。
- 尚未重启或验收目标会话 d53c097d-bdd5-47cc-b4dc-516c38591089；其读取接口返回 403，未修改该会话规格或运行状态。

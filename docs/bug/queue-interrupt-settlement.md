# 终止后派发记录阻塞新消息

## 证据与原因

2026-11-04 用户截图出现 SEND_STATUS_UNCONFIRMED，轮次已结束、队列暂停。QueueDeliveryStore.settle 将 interrupted 按普通失败保留 delivery；begin 无条件拒绝已有 delivery；后台又禁止追问 interrupted，形成无法收尾的状态。另一个竞态是 error 已到达后点击终止，服务仅返回 alreadyStopped，未处理失败派发。

## 修复边界

中断只撤销当前派发和该已派发队列项；聊天历史保留，任务不标为成功，其余待发送消息保留且不自动发送。发送新指令仍须经过原生实时状态准入。旧版 interrupted 记录由后台在无活动/授权/后台作业时收尾。error 后明确终止仅处理匹配的 FAILED 记录，必须有实时空闲证据；UNKNOWN、轮次变化和后台作业不清理。

## 验证

沿用 QueueReliabilityTest 的真实 SQLite 事务及聊天编排验证中断后新轮次准入、剩余队列暂停、迟到结果不影响新轮、旧记录恢复和 error 后终止。配合 ClaudeChatQueueReleaseTest 保留失败不自动释放约束。最终 12 项测试通过（QueueReliabilityTest 9、ClaudeChatQueueReleaseTest 3），宿主 Maven package 成功；最后一次构建复用未变前端产物（skip.frontend=true）。

2026-11-04 用户明确授权“修复并重启”。使用 node forge.mjs restart --scope backend；后端运行模式 dev、前端 static，后端端口 18080。受管后端 PID 从 50144 变为 21492，当次日志确认 19:13:03 启动成功，未发现 APPLICATION FAILED/FATAL/BUILD FAILURE。运行编译类 SHA-256 为 E7535313DC3D37A50E055B060E94C122A003AC54C2F29A1C4EC0F220EC3BB4C4，与专项测试版本一致。

19:16:30 至 19:17:46 连续观察超过 60 秒，后端 PID 21492、重启计数 0 保持稳定，/api/tools 持续 HTTP 200，所有启用服务 ready。前端 PID 157436 和隧道 PID 94812 保留；控制器连带重建 Studio 后 PID 121428 稳定。项目门禁 PASSED；静态 executedCheckers 为空，运行仅执行 API-RUNTIME-001，不将未执行检查记为通过。原手机会话点击终止与发送未实机复测，未直接改写业务数据库或队列数据。

## 19:23 再次反馈：轮次身份错位与准入拒绝未收尾

用户再次出现 TURN_BUSY、QUEUE_ADMISSION_REJECTED 与持续运行状态。后端日志确认 19:21:56 中断先返回 turnMismatch，再针对实际轮次返回 accepted；19:21:56 和 19:22:14 两次原生 Codex 清理均自然退出。这说明不能仅凭页面运行提示判定原生进程没有停止。

补查发现两处遗漏：中断校正只替换内存轮次 ID，持久派发仍绑定旧 ID，实际中断结果无法收尾旧派发，后续可能再次进入完成核对；Sidecar 拒绝接收新轮次时仅返回 error，后端没有结束本次未被接收的派发。迟到的中断回执还缺少轮次匹配保护。

本次修复保留被终止的原派发身份，收到实际中断终态后才清理对应派发；准入拒绝结束该次本地派发，但不声称原生引擎空闲、不释放下一条消息。显式终止在本地已空闲时核对原生实际轮次，仍活动则继续向该轮发送中断；核对失败明确报错，保留队列。迟到回执不能结束新轮次。未新增执行器、未改变原生中断能力，也未改变整体架构契约。

修复前新增用例实际出现 3 项断言失败；修复后 19 项定向测试通过（QueueReliabilityTest 13、ClaudeChatQueueReleaseTest 3、TurnLifecycleCoordinatorTest 3），包括原生轮次错位、拒绝准入、本地空闲后的原生终止与旧回执隔离。项目门禁 PASSED、退出码 0，仅执行 API-RUNTIME-001 检查当前服务 HTTP 200，静态 executedCheckers 为空；该结果不代表修复版已运行。

宿主及依赖 Maven package 成功（退出码 0），前端未变，复用既有产物。本次后端版本尚未重启加载；原手机会话触控、恢复发送及运行稳定观察待本次重启授权后验证。保留先前部署记录，不将先前运行验收复用为此次修复验收。

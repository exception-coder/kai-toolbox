# 终止后派发记录阻塞新消息

## 证据与原因

2026-11-04 用户截图出现 SEND_STATUS_UNCONFIRMED，轮次已结束、队列暂停。QueueDeliveryStore.settle 将 interrupted 按普通失败保留 delivery；begin 无条件拒绝已有 delivery；后台又禁止追问 interrupted，形成无法收尾的状态。另一个竞态是 error 已到达后点击终止，服务仅返回 alreadyStopped，未处理失败派发。

## 修复边界

中断只撤销当前派发和该已派发队列项；聊天历史保留，任务不标为成功，其余待发送消息保留且不自动发送。发送新指令仍须经过原生实时状态准入。旧版 interrupted 记录由后台在无活动/授权/后台作业时收尾。error 后明确终止仅处理匹配的 FAILED 记录，必须有实时空闲证据；UNKNOWN、轮次变化和后台作业不清理。

## 验证

沿用 QueueReliabilityTest 的真实 SQLite 事务及聊天编排验证中断后新轮次准入、剩余队列暂停、迟到结果不影响新轮、旧记录恢复和 error 后终止。配合 ClaudeChatQueueReleaseTest 保留失败不自动释放约束。最终 12 项测试通过（QueueReliabilityTest 9、ClaudeChatQueueReleaseTest 3），宿主 Maven package 成功；最后一次构建复用未变前端产物（skip.frontend=true）。

2026-11-04 用户明确授权“修复并重启”。使用 node forge.mjs restart --scope backend；后端运行模式 dev、前端 static，后端端口 18080。受管后端 PID 从 50144 变为 21492，当次日志确认 19:13:03 启动成功，未发现 APPLICATION FAILED/FATAL/BUILD FAILURE。运行编译类 SHA-256 为 E7535313DC3D37A50E055B060E94C122A003AC54C2F29A1C4EC0F220EC3BB4C4，与专项测试版本一致。

19:16:30 至 19:17:46 连续观察超过 60 秒，后端 PID 21492、重启计数 0 保持稳定，/api/tools 持续 HTTP 200，所有启用服务 ready。前端 PID 157436 和隧道 PID 94812 保留；控制器连带重建 Studio 后 PID 121428 稳定。项目门禁 PASSED；静态 executedCheckers 为空，运行仅执行 API-RUNTIME-001，不将未执行检查记为通过。原手机会话点击终止与发送未实机复测，未直接改写业务数据库或队列数据。

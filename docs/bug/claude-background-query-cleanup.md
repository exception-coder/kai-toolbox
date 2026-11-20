# Claude 中断后后台任务快照残留

## 现象与证据

2026-11-20，vibecoding宪法会话在主轮中断后仍显示后台任务 3 个。新消息被服务端以 SESSION_STATE_UNCONFIRMED / BACKGROUND_RUNNING 拒绝。12:24:06 后端收到中断请求，12:24:17 确认中断；两个子 Agent 的本地记录分别更新到 12:23:44 和 12:24:10。这些时间不证明业务任务已经完成。

`Session.backgroundTasks` 原来仅由 `background_tasks_changed` 替换。Claude 查询关闭后不再接收事件，旧快照仍被 runtimeState 返回，阻止下一轮。输入区仅判断主轮 running，又允许尝试直接发送，形成前后端不一致。

## 修复与边界

- 复用已安装 Claude Agent SDK 0.3.286 的查询生命周期。关闭查询后等待 `return()` 的异步 cleanup 完成，再清空该查询的后台快照并发布空列表。真实执行期间、仅收到 result 或刚请求中断时不提前清空；清理抛错时保留后台证据。
- SDK 文档说明后台快照为 CLI 进程级状态，重建进程需重置。SDK cleanup 内部等待子进程退出最多 2 秒；本次依据 SDK 查询清理合同，不宣称完成了操作系统级进程树退出证明。
- 主工作区桌面、移动端及共享页面在后台任务仍活动时使用现有待发送队列。主工作区同时消费运行状态接口的 BACKGROUND_RUNNING，按钮与发送分支保持一致。
- 不放宽服务端 canStartTurn，不自动继续被中断的队列，不重放截图中被拒绝的消息，不修改授权。保持现有架构与执行契约，FEED-01、EVID-01、CTRL-01 无例外。

## 验证与运行状态

定向验证覆盖异步清理前后快照、清理失败保留证据和共享页后台任务期间排队。当前会话的运行恢复与实际手机验收需加载修复版本后验证；源码修改不代表正在运行的 Sidecar 已更新。本次不触发服务重启。

- Sidecar TypeScript 编译通过，sessionAdmission 与 turnLifecycle 14 项通过；补齐旧 admission 测试夹具的 handoffs 集合，保留原派发时序断言。
- frontend typecheck、菜单目录与 feature boundaries 检查通过，共享页面 8 项回归通过，包含主轮已停止但后台任务仍活动时的排队行为。
- 项目质量门禁 status=PASSED、exit=0，实际执行 API-RUNTIME-001（HTTP 200），executedCheckers 为空；它不证明目标会话已恢复。
- 运行前端查询已到 bb3fe67cb / a85e92571cb4738686638335，本次 Sidecar 修复未加载，真实设备、原会话恢复及业务任务完成均未验收。

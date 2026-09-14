## 1. Implementation

- [x] 1.1 Add manifest default visibility and hide supplier quotes in the default set, preserving explicit preferences and routes.

## 2. Verification

- [x] 2.1 Verify default/reset behavior and manual restoration, run frontend build and Forge quality gate.
- [x] 2.2 Confirm frontend runtime and stable service identity for at least 60 seconds.

2026-09-13：typecheck、完整 npm build 均 exit 0。对实际源码转译执行默认隐藏、普通菜单保留、手动开启、保存后重载、恢复默认及路由保留断言全部通过。Forge CLI status/staticStatus/runtimeStatus 均 PASSED、exit 0；executedCheckers 为空（未运行静态 checker），9 个 API-RUNTIME-001 均通过。

开发模式 HTTPS 5173 已返回 defaultVisible:false；HTTP 18080/api/tools 为 200。01:44 至 01:45:52 复查前端 PID 46980、后端 PID 28220，重启次数均为 0，HTTP 正常。前端日志记录本次 HMR；一次 WebSocket ECONNRESET 后 HTTP 与进程仍稳定，无致命启动异常。范围外 wechat 保持任务开始时的 waiting restart、4 次重启状态。

2026-09-13 分模块提交复核：本模块源码未再修改，当前源码转译的默认集合、手动开启、重载、恢复默认和路由保留共 9 项断言通过；OpenSpec 严格校验通过。Forge CLI exit 0、PASSED，静态 checker 仍未执行，9 个运行探针通过。整个工作区 typecheck 被另一个未提交的项目 Git 树模块阻塞（组件导出及大小写文件名冲突），不将其记作本模块构建通过，也不纳入本模块提交。沿用上述本模块未变源码的构建与运行验收，本次只整理提交，不触发服务重启。

# 任务

- [x] 分离编辑与发送状态，开放回答期间的附件准备。
- [x] 调度后仅清除已发送快照，保留新编辑内容。
- [x] 定向回归：ConsultConversation 2 例、consultConversationState 12 例通过；测试隔离了其他暂存改动涉及的 API 与页面依赖。
- [x] 前端类型检查：npm run typecheck 退出码 0，菜单目录与模块边界检查通过。
- [x] 项目质量门禁：JSON status=PASSED、退出码 0；executedCheckers 为空，未执行静态检查器，9 个现有 API 场景通过，不代表本次输入交互已完成浏览器验收。
- [ ] 目标版本浏览器验收（未触发服务重启）。

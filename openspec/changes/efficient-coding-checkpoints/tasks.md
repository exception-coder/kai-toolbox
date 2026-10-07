## 1. 实现

- [x] 1.1 项目验证节奏存储/API 与兼容审计
- [x] 1.2 任务验收交接、批次控制与重复派发收口提示
- [x] 1.3 监督面板节奏选择与错误恢复

## 2. 验证

- [x] 2.1 专项回归、前端类型/构建和 OpenSpec 严格校验
- [x] 2.2 Forge 质量门禁与独立提交
- [ ] 2.3 [MANUAL_PRODUCTION] 经用户确认加载新版后端，验收实际会话后续派发与进度

## 验证记录

- 2026-10-07：HEAD 加本任务独立快照执行 Java 专项 26/26、前端专项 17/17 通过。Maven 覆盖 tool-claude-chat 及依赖编译；前端 build 包含 TypeScript 和边界检查，通过，保留既有大分块警告。
- 实际组件与本次构建 CSS 的隔离浏览器验收：1440、390、320px 保存节奏、门禁状态保持、键盘焦点、44px 触达、无横向溢出，以及失败后实际值与重试均通过。HTTP 为模拟响应，不代表新后端已运行。
- OpenSpec strict 校验通过。Forge CLI phase all：exit 0、status/staticStatus/runtimeStatus 均 PASSED；executedCheckers 为空，实际运行 9 项 API-RUNTIME-001，验证的是当前旧服务，不替代上述专项与新版运行验收。
- 未重启、未改业务项目任务勾选、未改活动轮或排队消息。2.3 待明确重启授权后执行；本 change 未归档。

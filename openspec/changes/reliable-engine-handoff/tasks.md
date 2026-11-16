# 实施与验收

- [x] 1. 持久化文字证据、引擎游标与切换操作，接入原会话权限和执行门禁。
- [x] 2. Sidecar 安全恢复、无业务工具接管、确认后切换及失败恢复。
- [x] 3. 原菜单进度、刷新恢复及往返切换交互；同步架构和业务说明。
- [x] 4. 集中执行状态机/SQLite/Sidecar/前端定向验证、类型与宿主编译、项目质量门禁，独立提交。
- [ ] 5. [MANUAL_CONFIRMATION] 经本次重启授权加载目标版本后，真实账号跨引擎往返、手机/桌面及稳定运行验收。

## 2026-11-16 开发验证

- 后端 42 项定向测试通过：交接状态机、内存 SQLite 幂等建表及级联、历史原文、WebSocket 门禁、项目排除及队列回归。
- Sidecar TypeScript 编译及 9 项测试通过；包含模拟原生响应的三引擎反复切换，不等同真实模型调用验收。
- 前端类型检查、31 项会话隔离测试、Vite 构建通过；宿主及依赖 Maven compile 通过。
- OpenSpec strict validate、git diff --check 通过。项目质量门禁 JSON status=PASSED、退出码 0；executedCheckers 为空，executedVerifiers 仅 API-RUNTIME-001（现有 /api/tools 返回 200），不能证明新功能运行通过。
- draw.io 引擎交接页与业务全景图已导出并目视检查；手机/桌面预览入口仅准备成功，真实浏览器未验收。
- 运行库 DDL 未核验，未执行迁移，未重启/部署；真实账号往返、登录态和稳定观察仍待执行。当前支持 Claude/Codex/Pi/Copilot，其他适配器明确拒绝。

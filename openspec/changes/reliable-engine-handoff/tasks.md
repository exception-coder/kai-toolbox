# 实施与验收

- [x] 1. 持久化文字证据、引擎游标与切换操作，接入原会话权限和执行门禁。
- [x] 2. Sidecar 安全恢复、无业务工具接管、确认后切换及失败恢复。
- [x] 3. 原菜单进度、刷新恢复及往返切换交互；同步架构和业务说明。
- [x] 4. 集中执行状态机/SQLite/Sidecar/前端定向验证、类型与宿主编译、项目质量门禁，独立提交。
- [ ] 5. [MANUAL_CONFIRMATION] 经本次重启授权加载目标版本后，真实账号跨引擎往返、手机/桌面及稳定运行验收。
- [x] 6. 修复首次历史导入及绑定提交的 SQLite 读快照升级冲突，完成文件型 WAL 并发/回滚测试、交接状态机回归和宿主编译。
- [x] 7. 修复普通项目目录被误判为评审目录而拒绝 Codex 交接的问题，验证原生请求的只读与工具限制。

## 2026-11-16 开发验证

- 后端 42 项定向测试通过：交接状态机、内存 SQLite 幂等建表及级联、历史原文、WebSocket 门禁、项目排除及队列回归。
- Sidecar TypeScript 编译及 9 项测试通过；包含模拟原生响应的三引擎反复切换，不等同真实模型调用验收。
- 前端类型检查、31 项会话隔离测试、Vite 构建通过；宿主及依赖 Maven compile 通过。
- OpenSpec strict validate、git diff --check 通过。项目质量门禁 JSON status=PASSED、退出码 0；executedCheckers 为空，executedVerifiers 仅 API-RUNTIME-001（现有 /api/tools 返回 200），不能证明新功能运行通过。
- draw.io 引擎交接页与业务全景图已导出并目视检查；手机/桌面预览入口仅准备成功，真实浏览器未验收。
- 运行库 DDL 未核验，未执行迁移，未重启/部署；真实账号往返、登录态和稳定观察仍待执行。当前支持 Claude/Codex/Pi/Copilot，其他适配器明确拒绝。

## 2026-11-17 database is locked 修复验证

- 修改前：文件型 WAL + 真实 Spring 代理，在读取历史期间由另一连接提交，稳定复现截图中的上下文 INSERT `SQLITE_BUSY_SNAPSHOT`。
- 修改后：12 项定向测试通过（4 项并发/事务测试、8 项既有交接状态机测试）；覆盖历史读取期间写库、prepare 暂停调用方事务、同时初始化复查和导入失败完整回滚。
- 宿主 toolbox-starter 及其 41 模块反应堆 compile 通过，未执行打包或服务重启；本次后端内部修复无需前端构建。
- OpenSpec strict validate、git diff --check 通过。项目质量门禁 JSON status=PASSED、退出码 0；executedCheckers 为空，executedVerifiers 仅 API-RUNTIME-001，验证的是现有服务通用接口，不是本修复运行验收。
- 未改表结构，运行库 DDL 未核验；没有写运行库、重放用户消息或重启服务。目标版本加载、真实消息发送及稳定观察待本次重启授权后执行，任务 5 保持未完成。

## 2026-11-21 Codex 交接回归

- Sidecar 隔离编译和 31 项定向测试通过。覆盖普通评审目录拒绝、项目目录交接走原生请求、沙箱与工具限制、源服务商隔离、原生身份及确认校验。
- OpenSpec strict validate 通过。质量门禁返回 PASSED，退出码 0，实际只运行当前服务的 API-RUNTIME-001。未重启，原会话切换及真实模型确认仍待运行验收。

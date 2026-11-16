# 任务与验收

- [x] 1. 实现具名授权、撤销和最小用户搜索，保留原操作权限；验证所有者、ADMIN、第三人、接收者、未登录、账号禁用、项目排除与会话删除边界。
- [x] 2. 实现会话共享面板、共享给我列表及只读分页页面，通过失败恢复和撤销的组件回归；同步能力说明、架构边界和全景图。手机/桌面真实布局与登录态验收见任务 4。
- [x] 3. 定向后端测试、前端 typecheck/build 与项目适用质量门禁通过；检查 diff 后单独提交。
- [ ] 4. [MANUAL_CONFIRMATION] 用户确认重启目标版本后进行手机/桌面真实浏览器、登录态及稳定运行验收，并通过正式 API 把示例会话授权给核对过的严伟账号。未执行，不宣称已共享。

## 2026-11-16 验证证据

- 后端：`mvn -pl tools/tool-claude-chat -am test "-Dtest=SessionSharingServiceTest,SessionSharingControllerTest,SessionSharingRepositoryTest,ClaudeChatSessionAccessPolicyTest" "-Dsurefire.failIfNoSpecifiedTests=false"`，21 项通过，无跳过。覆盖最小文字投影、不返回工具输入输出/原生身份、两种分页、撤销、认证/项目/所有权、目录搜索和 SQLite 幂等/上限/级联清理。原始输出 `.run/share-chat-maven-final.log`。
- 宿主：`mvn -pl toolbox-starter -am compile "-Dmaven.test.skip=true"`，41 个模块编译成功；没有启动应用，不代表 Spring 运行装配或新功能运行通过。
- 前端：共享面板和只读页 3 项 Vitest 用例通过；`npm run typecheck` 与架构边界检查通过；`npx vite build --outDir ../.run/share-chat-build` 成功，产物只在临时目录，没有发布。原始输出 `.run/share-chat-vitest.log`、`.run/share-chat-typecheck-final.log`、`.run/share-chat-build.log`。
- OpenSpec 严格校验通过。全景图已由 draw.io 导出 PNG 并实际查看，文字未溢出。
- 项目质量门禁 `verify -Phase all`：JSON `status=PASSED`，退出码 0；`executedCheckers=[]`，不能声称执行了静态检查器；实际 Runtime 为 `API-RUNTIME-001 / toolbox-api-tools`（当前旧服务 HTTP 200），不能作为新共享功能验收。原始 JSON `.run/share-chat-quality.json`。
- `prepare_sql_context` 返回 `DDL_MISSING`，运行库 DDL 未核验；Forge 资源绑定为空。按本仓 schema 编写的新迁移仅在内存 SQLite 验证，未写运行库。
- `prepare_page_preview` 已准备指定会话的 phone/desktop 入口，均为 `WAITING_VIEWER_AUTH`。入口准备不等于登录、目标版本加载或验收；目前未重启、未授予任何真实账号共享权限。

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

## 会话行临时共享

- [x] 从最近会话和项目会话的「⋯」打开同一授权面板，显示会话名称、期限、撤销和复制入口。保留原有会话工具入口。
- [x] 新增临时授权存储与到期校验。读取列表、历史和会话详情均检查期限。旧版回退时不会读取临时授权。
- [x] 22 项 Java 和 15 项前端定向用例通过，覆盖过期、撤销、读取中失权、旧表隔离、会话行定位及授权表单。OpenSpec 严格校验通过。项目通用接口探测通过，其运行对象仍是旧服务。
- [ ] 在目标版本上完成手机、桌面与双账号登录验证。预览入口已准备，状态为 `WAITING_VIEWER_AUTH`。当前宿主未重启，示例会话未实际授予严伟。

本次 `prepare_sql_context` 为 `DDL_MISSING`（`b03f4dd5-8d5b-439f-82da-e94824e514ea`），Forge 无可用数据库资源绑定。新增表按源码中 SQLite schema 编写，运行库 DDL 未核验，未直接执行运行库写入。

## 限时协作与撤回

- [x] 共享面板授权继续原会话并可直接撤回，协作连接绑定单一会话，旧只读授权保持不变。
- [x] 30 项 Java 与 36 项前端定向用例通过。覆盖旧库迁移、授权范围与撤回、附件访问、链接进入原工作台、连接失权清理。OpenSpec 严格校验通过。Forge 通用接口探测通过，探测的是当前旧服务。全景图已重新导出并查看。
- [ ] 确认重启后，对目标版使用两个实际账号验证收发、排队、中断及实时撤回。手机和桌面预览已准备，等待用户认证。未实际授予示例账号权限。

本次 `prepare_sql_context` 为 `DDL_MISSING`（`97730295-8e5c-4e5c-83be-3d9ea74842d0`）。Forge 未绑定可查询数据库，迁移以源码和内存 SQLite 验证为依据，运行库 DDL 未核验。

## 普通接收账号打开共享链接

- [x] `yanw` 登录后看到模块级 ADMIN 拒绝。定位到路由在共享页面挂载之前检查了菜单权限，聊天运行时也只对菜单和 PRD 入口自动激活。
- [x] 接收链接和协作工作台链接分别核验后端的只读和协作授权。授权成功后激活已有会话引擎，普通模块入口仍走原门禁。
- [x] 59 项定向前端测试和类型检查通过，覆盖无菜单权限、只读降级、错会话、已撤回、匿名与需求入口。OpenSpec 严格校验和通用接口质量门禁通过。
- [ ] 使用 `yanw` 从有效链接登录态验证桌面和手机打开、收发及撤回。当前开发前端已返回更新的门禁与激活模块。手机与桌面预览待用户认证。

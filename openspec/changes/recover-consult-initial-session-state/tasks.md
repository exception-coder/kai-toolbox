## 本地修复

- [x] 修复两个列表接口的空值查询及 SDK ID 规范化，保留权限与历史记录。
- [x] 咨询历史主导初始恢复，运行提示失败不再锁死入口，历史失败仍提供安全重试。
- [x] 前端恢复、系统显示与会话状态定向回归 21 项通过。
- [x] 后端 37 项定向回归及 toolbox-starter reactor 编译通过。
- [x] 前端 typecheck / 隔离输出构建。
- [x] 项目质量检查与严格规格校验通过。
- [x] 本地提交（提交号见 Git 历史，部署验收另列）。

## 待部署验收

- [x] 用户明确确认后定向重启后端及其辅助服务，完成路由加载、HTTP 探测与至少 60 秒稳定观察；前端沿用原 Vite 进程，不另行重启。
- [ ] 在允许读取的浏览器中验证桌面与移动端原咨询可恢复，无重复提问。

## 证据边界

2026-10-17：修复前 MockMvc 复现空 SDK ID 和空创建人导致的 HTTP 500、SDK ID 首尾空白漏判；前端复现辅助运行列表失败导致入口锁定。

- 修复后 Maven `-pl toolbox-starter -am test`（JDK 21，指定五个测试类，未执行全套测试）退出 0：ClaudeChatSessionListTest 2 项、ClaudeChatSessionAccessPolicyTest 11 项、SessionHistoryServiceTest 9 项、ConsultSessionListTest 1 项、ConsultServiceAccessTest 14 项，无失败或跳过。
- 前端恢复、系统显示及会话状态三个测试文件共 21 项通过；同时校正系统显示测试中已过期的保存按钮文案。typecheck 首次指出新测试夹具字段不全，补齐真实类型后恢复测试 5 项再次通过，`npm run typecheck`（含 Feature boundaries 和菜单目录检查）退出 0。
- `npx vite build --outDir ../.git/consult-recovery-frontend` 退出 0，6370 模块转换成功；隔离产物含修复后的咨询页面，未替换运行目录或发布助手 SDK。保留原有大包及静态/动态混合导入警告。
- Forge Quality JSON `status=PASSED`、退出 0；`executedCheckers=[]`，仅执行九项既有 API 探测，指向原运行服务，不代表本修复已运行验收。OpenSpec 严格校验通过。

首次代码交付时未重启、未部署；当时 `node forge.mjs status` 与开始时服务身份一致。已有其他任务未跟踪的测试产物保持原状。

## 2026-10-17 运行核验

- 用户随后明确授权重启，执行 `node forge.mjs restart --scope backend`，目标源码为 `b56a5c898`。该入口会构建 Sidecar 并完成 Maven 宿主 install 后启动后端；未关闭服务或跳过必要能力。
- 后端受管 PID 从 22552 更新为 92220，微信与 Studio 更新为 49976、64708；前端 22576、隧道 22756 保持不变。连续观察 79 秒，起止 PID 相同且受管重启数均为 0。
- 重启前附件策略接口匿名探测为 404；重启后多次 GET 为 401，证明路由已加载且仍要求登录。`/api/tools` 为 200，咨询历史匿名为 401，开发会话列表为 200；没有伪造身份或绕过鉴权验证策略内容。
- 公网检查首次首页超时、API 200，复查首页及 API 均 200、`health.state=ready`。新运行版本的 Forge Quality JSON `status=PASSED`、退出 0，仍只有九项既有 API 探测，`executedCheckers=[]`。
- 后端日志显示 Sidecar 已连接、引擎目录 ready 和原会话恢复；同时出现 Qdrant 连接超时、ASR 连接拒绝、大请求头拒绝及缺失 PRD 历史等独立告警，未声称这些问题已修复。最近 80 行日志无法补证完整启动摘要，不将 ready 标志当成完整日志验收。
- Studio HTTP 200。微信 `/health` 持续 500，日志含设备未授权提示，具体异常栈未完整取得；微信健康验收未通过，不关闭或伪报该服务正常。
- 线上页面读取仍受已保存的站点权限策略限制；登录后策略 200、原咨询上传及桌面/移动端完整交互仍待用户重试确认，匿名 401 不代表上传端到端通过。

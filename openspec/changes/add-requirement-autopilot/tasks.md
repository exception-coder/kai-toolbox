## 实现与本地验收

- [x] 增加显式需求监督策略，复用原运行存储、队列、版本、预算和人工接管。
- [x] 补齐需求专用交接、完成字段校验、证据停滞与后台恢复分支，不进入严格 OpenSpec 适配器。
- [x] 原弹框提供方式选择和自然语言输入，监督摘要/看板/推进详情区分 Agent 自验。
- [x] 完成后端定向回归与宿主装配构建、前端定向测试及构建、项目质量门禁。
- [x] 完成手机/桌面隔离浏览器验证，检查关闭焦点、草稿、错误重试、预算与滚动。
- [x] 同步 AI 编程架构正文、流程图、能力边界及模块说明。

## 待授权运行验收

- [ ] [MANUAL_PRODUCTION] 用户确认本次重启后，目标版本启动并验收真实 Claude/Codex 需求任务的进度上报、跨轮续跑及暂停恢复；核查日志、HTTP 和至少 60 秒稳定观察。未部署、未执行。

## 本地验证证据

- 2026-10-24：JDK 21，`mvn -pl toolbox-starter -am package "-Dtest=RequirementAutopilotServiceTest,SessionAutopilotServiceTest,SessionAutopilotRepositoryTest,AutopilotQueuedContextServiceTest,OpenSpecContinuousRunnerTest" "-Dsurefire.failIfNoSpecifiedTests=false" "-Dskip.frontend=true"` 通过。58 项后端定向测试通过，宿主及其依赖打包通过；未将本轮前端重新嵌入 jar，未启动该制品。
- 前端 SessionAutopilotStatus、AutopilotProgressWorkspace、api.autopilot 共 19 项用例通过；`npm run build` 通过，最终交互调整后 `npm run typecheck` 和 Vite 生产构建通过。Assistant SDK 构建和 Feature boundaries 均通过。
- Firefox 155 使用真实组件、生产 CSS 和 HTTP 夹具，在 1440×900、390×844、390×568 验证模式切换、需求草稿、Escape/焦点恢复、失败重试、末行按钮可达及暂停/恢复，无脚本错误、无横向溢出。该证据不代表真实模型或运行版本已验收。
- OpenSpec strict validation 通过，架构新流程图经 Mermaid 解析通过，`git diff --check` 通过。
- `forge-quality.ps1 verify` JSON 为 PASSED，退出码 0；executedCheckers 为空，9 项既有 API 探测通过，不将它们视为新模式端到端或新版本运行验收。

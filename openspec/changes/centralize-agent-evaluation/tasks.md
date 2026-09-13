## 1. Unified workspace

- [x] 1.1 合并前端 feature 与工作台导航，保留 Registry 草稿和教学详情。
- [x] 1.2 实现旧地址兼容、Agent/题集/报告 URL 上下文及恢复操作。
- [x] 1.3 更新能力探索入口、菜单权限生成目录及项目文档入口。

## 2. Verification and delivery

- [x] 2.1 通过专项导航/评测测试、前端 typecheck 和 build。
- [x] 2.2 通过 Forge CLI all、真实桌面/移动浏览器验收和 60 秒稳定观察。
- [x] 2.3 更新验证记录并严格校验 OpenSpec，核对本任务范围并提交。

## Validation

- 2026-09-12：`AgentManagementPage.test.tsx` 6 项、教学详情 2 项、能力探索 3 项，共 11 项通过。测试覆盖旧链接、上下文返回、草稿保持、题集切换、缺失题集与 API 重试；最初使用 data router 遇到 jsdom 与 Node AbortSignal 类型冲突，已改为与本次客户端路由一致的 MemoryRouter，未修改应用协议或全局测试设置。
- `npm run typecheck`、架构边界检查及 `npm run build` 通过；菜单目录 58 项一致。构建保留项目已有大 chunk 警告，无构建错误。
- Forge CLI `verify -Project . -Format json`：退出码 0，status/staticStatus/runtimeStatus 均 PASSED；executedCheckers 为空，不能声称运行了静态 checker；API-RUNTIME-001 实际运行 9 个配置场景并通过。前端由专项测试、typecheck/build 另行验证。
- 真实浏览器：1440×1000 与 390×844 通过。验证登录后唯一菜单、列表与评测切换、Agent 题集带入、6 条历史结果展示、旧报告 URL、浏览器后退与刷新、缺失题集禁用与恢复。移动文档宽度等于视口 390，无 main/section/select 横向溢出，浏览器控制台无 error。未发起真实模型跑批、发布版本或修改历史数据。
- 截图及原始日志位于本地 `.codex-work/agent-evaluation-*`，不进入 Git。
- 运行观察 01:47:11–01:48:13 UTC，62.635 秒：backend PID 73672、frontend PID 68720，重启数均为 0；三次检查 6 个相关 API、新版 Vite 源模块与菜单目录均通过。观察窗口无新增致命日志。旧 frontend.error.log 中 03:19:58 ReqPoolPage 重复声明早于当前 18:32:15 本地启动；18:42 的 WebSocket ECONNRESET 在观察前停止，未误记为本次编译失败。微信服务在本任务开始前即 waiting restart、重启数 4，未纳入本次前端交付范围。

## Agent review

本次由实施 Agent 自审，非独立或人工审查。逐项核对本 change 场景、源码和测试，采用现有组件、路由与 API；评测代码迁入同一 feature，无新增跨 feature 私有依赖。管理入口已集中，但可信候选版本评测不在本切片内，界面与 README 明确保留该边界。

## Handoff

源码前端通过现有 Vite HMR 生效；后端与数据契约未变。本 change 保留活动记录，未执行主规格同步或归档，不宣称完成可信候选版本绑定。仅持有旧评测菜单权限的账号需要管理员配置 Agent 管理权限。

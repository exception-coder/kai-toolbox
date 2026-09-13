## 1. Unified workspace

- [x] 1.1 合并前端 feature 与工作台导航，保留 Registry 草稿和教学详情。
- [x] 1.2 实现旧地址兼容、Agent/题集/报告 URL 上下文及恢复操作。
- [x] 1.3 更新能力探索入口、菜单权限生成目录及项目文档入口。

## 2. Verification and delivery

- [x] 2.1 通过专项导航/评测测试、前端 typecheck 和 build。
- [x] 2.2 通过 Forge CLI all、真实桌面/移动浏览器验收和 60 秒稳定观察。
- [x] 2.3 更新验证记录并严格校验 OpenSpec，核对本任务范围并提交。

## 3. Viewport repair

- [x] 3.1 修复工作区剩余高度分配并回归高屏、矮屏、窄屏、长内容及评测切换。
- [x] 3.2 将可用视口与滚动归属验收补充到团队规范，完成当前构建、运行观察与定向提交。

## Validation

- 2026-09-13 视口修复：原高度链在浏览器复现（仅浏览器恢复旧类，不还原源码），1920×1080 时工作区底边 673，剩余 407px 未利用；修复后底边 1080。1920×1200、1440×900、1280×600、1024×768 的左右面板底边均跟随页面；390×844 纵向表单与底部按钮可达，无文档横向溢出。覆盖动态 resize、侧栏收放、能力长内容、键盘返回保存按钮、评测视图隐藏/恢复及 API 失败恢复；浏览器无 pageerror。原生窗口标题栏覆盖模式和浏览器原生缩放未执行，不由普通浏览器测试代替。
- 当前 8 项导航/教学回归、typecheck、架构边界与 build 通过。末次修改将吸底限定为桌面，窄屏操作栏随正文流动；其后重新通过浏览器、typecheck/build 与 Forge CLI。Forge status/staticStatus/runtimeStatus 均 PASSED、退出码 0；executedCheckers 为空，未运行静态 checker；API-RUNTIME-001 的 9 个场景通过。已有 chunk 大小警告保留。
- 源码运行范围：Vite HTTPS 5173，既有后端 HTTP 18080；新版 Vite 页面模块及实际页面验证通过，不改后端契约。08:46:30–08:47:33 UTC 连续观察 63.050 秒，backend PID 28220、frontend PID 46980，重启数均为 0，HTTP 及源模块持续正常，当次追加日志无致命启动或前端编译错误。微信服务原有 waiting restart 不在本次前端交付范围。证据存于本地 `.codex-work/agent-viewport-*`，不提交临时产物。
- 纠正已记入 `docs/coding-violations.md` 第 36 项；项目 Quiet Luxury 规则同步删除工作台统一最大宽度约束。团队唯一源码 `team-tools/team-standards` 的 frontend-excellence 增加可用视口契约，3.4.1 的三处版本、入口同步、引用、Skill 结构与审计通过，提交 `fdf91fd` 已推送。此为 Agent 验收规范，未新增自动布局检查器；安装中的旧会话缓存不会因源码推送自动改写。

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

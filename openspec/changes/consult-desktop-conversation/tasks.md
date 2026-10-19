## Implementation
- [x] Inspect existing recovery, ownership, draft, workflow and resource boundaries.
- [x] Implement desktop conversation workspace, own recent recovery, explicit new/continue and nonblocking date reminder.
- [x] Implement bounded source references, current workflow assembly and idempotent continuation creation.
- [x] Verify frontend targeted cases, typecheck and feature boundaries.
- [x] Verify Java ownership, replay, excerpt SQL and host assembly.
- [x] Finish temporary-output Vite production bundling.
- [x] Complete quality gate and scoped delivery review; commit/push evidence is the actual Git record.

## Verification evidence (2026-10-19)
- Frontend: 21 page recovery/navigation cases plus 9 date, request identity and announcement cases passed. Typecheck exit 0; 60 menu permissions and feature boundaries passed, no new private imports.
- Java: 32 targeted cases across access, continuation, session HTTP and source routing passed. The new HTTP fixture initially lacked GlobalExceptionHandler; it was corrected and its two cases passed on rerun. The other 30 successful cases had unchanged inputs and were reused. Real SQLite exercised bounded excerpts and session filtering; a locked historical native-library cleanup warning did not prevent these cases passing.
- Host: all 41 reactor modules packaged with `-Dskip.frontend=true -DskipTests`, exit 0. This verifies host assembly, not a new application startup or frontend embedding.
- Quality CLI: JSON status PASSED, process exit 0; executedCheckers is empty, and nine existing API runtime probes passed. These probes do not cover the new consultation endpoints or new model session.
- Frontend output stays in TEMP and does not publish the Assistant SDK or replace the running frontend. The first build was stopped under memory pressure; the 2048 MiB attempt exhausted its heap. The final build passed in 5m11s with 6423 transformed modules, a 3072 MiB heap, no minification and no compressed-size report.
- Read-only managed status: backend/frontend and enabled auxiliary services ready, restart counts 0. No service restart or deployment was initiated. New target runtime smoke, model continuity and stability observation remain pending below.

## Pending runtime acceptance
- [ ] Real desktop browser, keyboard, focus and long/short-height review (browser access unavailable in this session).
- [ ] New target backend deployment, actual model continuation, HTTP smoke and 60-second stability observation after fresh user restart confirmation.

## 桌面布局纠正（2026-10-19）

- [x] 默认有边距800px会话/草稿/归档面板，保留画布；显式展开与还原只调整尺寸。设置按需挂载为纵向菜单，移除图谱状态的重复返回动作。
- [x] 桌面内联追问与主题背景、表面、边框一致，手机继续复用原紧凑输入与编辑层；修正Tailwind独立translate造成首问面板偏出画布。
- [x] 37项定向测试通过，覆盖桌面展开、设置关闭恢复、原会话与草稿、内联追问和项目配置；初次旧用例仍按常驻工具栏/隐藏画布断言，已按当前行为修正；发现项目更新测试的异步通知竞态，等待缓存通知后通过。npm run typecheck退出0（菜单目录与架构边界同时通过）；OpenSpec严格校验通过；质量门禁PASSED/exit 0，仅9项既有API、无静态checker，不作为新UI运行证据。
- [ ] 浏览器完整验收：现有本机页面已观察到单一顶部栏和800px首问面板，但历史咨询加载失败，后续CDP多次超时；未取得实际对话输入区、更多菜单、长短屏和手机完整视觉证据。未触发服务重启或发布，仍待真实环境复核。

## 1. 导航与页面

- [x] 1.1 实现 local-tools manifest、公开组合页、兼容路由和权限过滤，验证统一导航及深链接场景。
- [x] 1.2 原工具支持 embedded，页签惰性挂载并保留状态，验证稳定上下文及可访问自适应场景。

## 2. 验证与交付

- [x] 2.1 组件回归、typecheck/build、菜单生成目录检查和 OpenSpec strict 验证。
- [x] 2.2 Forge CLI all、桌面/窄屏/矮屏浏览器验证及 60 秒运行观察，记录实测证据。
- [x] 2.3 更新使用说明、核对本次 diff 和独立提交范围，不包含其他任务改动。

## 验收证据（2026-09-13，Agent 自审）

- `npx vitest run src/features/local-tools/LocalToolsPage.test.tsx src/shell/menuMigration.test.ts src/shell/mergedFeatureAccess.test.ts`：3 文件、18 测试通过。统一导航、旧地址、权限拒绝、菜单迁移、状态保留和键盘选择均有对应场景。
- `npm run typecheck`、`npm run build`：退出码 0，架构边界检查通过，菜单权限目录一致。首次构建受并行内容工具变更的导出缺失影响；对方完成后重跑通过。完整构建包含助手发布测试及 session-client 构建；保留既有大 chunk 提示。证据 `.codex-work/local-tools-typecheck.log`、`local-tools-build.log`。
- Forge CLI `verify -Project . -Format json`：退出码 0，status/staticStatus/runtimeStatus 均为 PASSED。executedCheckers 为空，未宣称 Java 静态检查已执行；实际执行 API-RUNTIME-001 的 9 个配置场景均 HTTP 200。前端静态验证由上项 typecheck/architecture/build 提供，证据 `.codex-work/local-tools-forge.json`。
- Playwright 使用实际登录和工具页面，验证目录输入和端口结果跨页签保留、端口查询 HTTP 业务结果、终端首次 ready、切走切回同一个 WebSocket、命令输入回显及 exit 0、Tunnel 状态视图、旧路由参数、无效目标恢复、窄屏无效端口禁用查询。未执行文件迁移、杀进程或隧道启停。桌面 1440×900、矮屏 1280×600、高屏 1920×1200、窄屏 375×812 均无页面横向溢出，终端面板底边与可用视口一致；已人工查看截图。证据 `.codex-work/local-tools-browser.json`、`local-tools-browser.log` 与截图。
- 开发模式 Vite:5173 加载本次源码，backend:18080 复用运行版本，未构建/发布后端 fat jar。连续 63493ms 起/中/止观察，两服务 PID 与重启次数保持不变，源码及健康响应 HTTP 200，无新增致命日志。证据 `.codex-work/local-tools-stability.json`。
- 范围外存量问题：wechat 在开始及观察结束均 waiting restart、restarts=4。重接已有 detached 终端时，后端 handleOpen 在 attach 之前调用 sendMessage(Ready)，wsRef 为空而丢失 ready；实测收到 output 但状态停 opening。本次未修改该后端路径，新会话及模块内保活切换验收通过，不能据此宣称旧会话重接问题已修复。
- 原始日志/截图为本地忽略的验收产物，不作为可重现 CI 证据入仓。使用说明登记 docs/INDEX.md；与其他任务共享的索引及生成目录只纳入本次条目。change 保持活动，不提前归档或晋升主规格。

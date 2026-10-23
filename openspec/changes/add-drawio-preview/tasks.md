# 实施任务

- [x] 固定官方自包含 Viewer 资源、保留许可及校验值，避免重复加载内嵌 stencils。
- [x] 实现浏览器有界解析、隔离画布、多页、缩放、全屏与错误恢复。
- [x] 接入直接打开/拖拽和 Vibe Coding 工作目录完整文本预览。
- [x] 完成 17 项定向回归、类型检查、前端构建、质量门禁和隔离浏览器验收。
- [ ] 用户确认更新运行版本后核验正式入口；本次不自行重启或推送。

## 验证记录（2026-10-23）

- `npx vitest run src/features/doc-viewer/drawio src/features/doc-viewer/file-preview/__tests__ src/features/claude-chat/components/FileTreePanel.test.tsx`：5 文件、17 项通过；含标准压缩页、20 MiB 解压中断、非法 XML/DTD、实例回执隔离、工作目录完整/截断文件。
- `npm run typecheck` 和 `npx tsc -b --noEmit` 通过；`npm run build` 包含宿主类型、组件边界及 Assistant SDK 构建，资源随 `dist/vendor/drawio/32.5.5` 分发。现有大 chunk/混用静态与动态导入告警不阻断构建。
- `forge-quality.ps1 verify -Project . -Format json`：JSON `status=PASSED`、exit 0；静态 `executedCheckers=[]`，仅运行 9 项既有 API 验证，不代表新图形运行验收。
- `openspec validate add-drawio-preview --strict` 通过。
- Firefox 155 真实浏览器，隔离 fixture 加载本次实际 React 组件、本地第三方 bundle 和构建 CSS，不依赖已登录 Forge。1440×900、390×844 均验证压缩/未压缩、多页、内置 stencil、缩放/适应窗口、全屏/Escape/保留所选页、源码、损坏输入/重试、工作目录弹框/全屏/Escape。手机 document scrollWidth=390，画布 364×522，无横向溢出；已审阅截图。外部图片由 CSP 拒绝，未发出网络请求；损坏 XML 与 CSP 日志为预期用例结果。
- Chromium 自动化启动超时，未宣称 Chrome 或用户手机浏览器验收通过；Firefox 完成实际浏览器验证。正式登录路由与目标部署版本待运行验收；未重启、未做新版本 60 秒稳定观察，不将旧服务 API 成功记为新版本验收。

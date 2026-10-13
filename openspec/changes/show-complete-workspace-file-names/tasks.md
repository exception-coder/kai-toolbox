# 实施与验证

- [x] 文件树固有宽度、独立横向滚动、完整路径提示及预览标题换行。
- [x] 浏览器深层目录与同前缀 Java 文件、预览和窄屏验证。
- [x] typecheck、独立前端构建、OpenSpec 严格校验与项目质量门禁。
- [x] 本地提交，不推送、不自行重启。
- [ ] 新版真实会话文件树验收；如需重启须取得本次明确授权。

## 证据（2026-10-14）

- Edge 使用真实 FileTreePanel 的隔离 API 样例，展开 10 层目录及两份同前缀 Java 文件。原先固定宽度加 truncate 导致名称缩短；本次名称固有宽度分别约 238px / 275px，没有内部截断。1440×900 树视口 319px、内容 535px，横向滚动至 176px 后两个完整文件名均在可视范围内。鼠标横向滚动及聚焦树后左右键均可操作，标题 / 筛选不跟随树滚动。
- 1920×1080 / 1280×600 树仍为 319px 宽，内容 535px，树可用高度分别 943px / 463px，页面本身没有横向溢出。390×844 手机面板视口 390px，横向滚动至 145px 后完整文件名、大小和定位入口可读；没有页面横向溢出。
- 打开第二份文件，预览文本对应 IdempotencyCoordinator，标题完整。手机预览标题 211px 宽、40px 高，通过换行展示，内部无溢出。关闭后目录展开状态仍保留。空目录和读取失败反馈可见，关闭入口仍可达。没有读取、定位或修改真实项目文件。
- `npm run typecheck` exit 0，59 个菜单目录匹配，Feature boundaries 无新增违规。独立 `npx vite build --outDir dist/file-tree-names-build` exit 0；保留现有大 chunk 警告，没有发布或重启。纯呈现修改用真实布局验证，没有新增镜像 CSS 的单元测试。
- OpenSpec strict 校验通过；Forge 全阶段 exit 0 / JSON PASSED，静态 executedCheckers=0，9 项既有 HTTP 探测，不代表本次前端真实会话验收。
- 原始日志：`.git/file-tree-names-*.log`。截图：`frontend/dist/file-tree-names-evidence/desktop-full-names.jpg`、`mobile-full-names.jpg`、`mobile-preview.jpg`，均为本地忽略产物。全页截图会重置内层横向位置，最终证据采用保留滚动位置的原生截图。

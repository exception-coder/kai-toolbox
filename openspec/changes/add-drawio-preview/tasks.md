# 实施任务

- [x] 固定官方自包含 Viewer 资源、保留许可及校验值，避免重复加载内嵌 stencils。
- [x] 实现浏览器有界解析、隔离画布、多页、缩放、全屏与错误恢复。
- [x] 接入直接打开/拖拽和 Vibe Coding 工作目录完整文本预览。
- [x] 完成 17 项定向回归、类型检查、前端构建、质量门禁和隔离浏览器验收。
- [ ] 用户确认更新运行版本后核验正式入口；本次不自行重启或推送。

## 消息链接扩展（2026-10-24）

- [x] 回复中的本地图文件链接打开原位弹框，复用图形渲染和全屏能力。
- [x] 专用完整读取接口复用现有项目访问范围，限定图类型、UTF-8 和 5 MiB。
- [x] 消息链接、焦点/取消/重试、后端范围与超限回归和隔离浏览器验证。
- [x] 最终前端产物及宿主后端打包。
- [ ] 正式运行版本加载与真实登录入口验收；不自行重启。

### 扩展验证记录

- 前端定向 5 文件、24 项通过：`npx vitest run --maxWorkers=1 src/features/claude-chat/components/Markdown.paths.test.tsx src/features/claude-chat/components/Markdown.lazyDiagram.test.tsx src/features/doc-viewer/drawio src/features/claude-chat/components/FileTreePanel.test.tsx`。涵盖绝对/file URI/裸相对链接、行号、普通链接兼容、无会话、失败重试、关闭/切会话取消、焦点恢复和原渲染器回归。机器负载下文件树旧用例的懒加载曾超时，改为等待真实动态 import 完成，不放宽业务条件。
- 后端 `SessionFileControllerTest` + `SessionLocalPathAccessServiceTest` 共 10 项通过；真实临时文件核对超过 512 KiB 的完整内容、附加目录、越界/排除、缺失文件、类型、UTF-8 和 5 MiB 拒绝。初次终端 Maven 使用 JDK 8，已在命令内指定已安装的 JDK 21 后通过，未改服务配置。
- Firefox 155 隔离真实浏览器验证 1440×900、390×844：AI 回复直接打开、相对路径、点击前无读请求、全屏/Escape、关闭恢复原链接与滚动位置、失败重试、没有系统打开请求；零浏览器脚本异常，手机 scrollWidth=390、画布 364×655。测试使用真实组件与本地渲染资源，文件读取由测试响应提供，不代表新后端已经部署。
- 质量门禁 JSON `status=PASSED`、exit 0，静态 checker 为空、既有 API 9 项通过；不将旧服务响应记为新接口运行验收。OpenSpec strict 通过。
- `npm run build`（含 Assistant SDK、边界和类型检查）通过；最后代码调整后 `npx tsc -b --noEmit` + `npx vite build` 再次通过，已核对产物包含会话隔离保护及关闭 Viewer 内部空工具条的配置。最终产物 CSS 下 Firefox 用例再次通过。
- JDK 21 下 `mvn -pl toolbox-starter -am package '-DskipTests' '-Dskip.frontend=true'` 通过，覆盖宿主后端装配；前端按独立构建验证，未宣称已将其发布到运行服务或生产 fat jar。当前受管服务仍 ready/online，没有执行重启或 60 秒新版本稳定观察；新读取接口须后端更新后再验收。

## 验证记录（2026-10-23）

- `npx vitest run src/features/doc-viewer/drawio src/features/doc-viewer/file-preview/__tests__ src/features/claude-chat/components/FileTreePanel.test.tsx`：5 文件、17 项通过；含标准压缩页、20 MiB 解压中断、非法 XML/DTD、实例回执隔离、工作目录完整/截断文件。
- `npm run typecheck` 和 `npx tsc -b --noEmit` 通过；`npm run build` 包含宿主类型、组件边界及 Assistant SDK 构建，资源随 `dist/vendor/drawio/32.5.5` 分发。现有大 chunk/混用静态与动态导入告警不阻断构建。
- `forge-quality.ps1 verify -Project . -Format json`：JSON `status=PASSED`、exit 0；静态 `executedCheckers=[]`，仅运行 9 项既有 API 验证，不代表新图形运行验收。
- `openspec validate add-drawio-preview --strict` 通过。
- Firefox 155 真实浏览器，隔离 fixture 加载本次实际 React 组件、本地第三方 bundle 和构建 CSS，不依赖已登录 Forge。1440×900、390×844 均验证压缩/未压缩、多页、内置 stencil、缩放/适应窗口、全屏/Escape/保留所选页、源码、损坏输入/重试、工作目录弹框/全屏/Escape。手机 document scrollWidth=390，画布 364×522，无横向溢出；已审阅截图。外部图片由 CSP 拒绝，未发出网络请求；损坏 XML 与 CSP 日志为预期用例结果。
- Chromium 自动化启动超时，未宣称 Chrome 或用户手机浏览器验收通过；Firefox 完成实际浏览器验证。正式登录路由与目标部署版本待运行验收；未重启、未做新版本 60 秒稳定观察，不将旧服务 API 成功记为新版本验收。

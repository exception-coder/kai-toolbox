# 实施任务

## 移动图纸阅读 P0（2026-11-01）

- [x] 确认本地 GraphViewer 的 fitGraph 按宽度与容器尺寸处理，改为受控固定画布、真实图形边界双轴 fit、12px 留白及居中；全貌尺寸变化自动重算，细节保留中心与比例。
- [x] 单行 48px 工具栏、44px 触控目标，缩放和长说明收纳到更多；全屏使用单行返回/页目录/全图/更多，画布占剩余空间及安全区域，取消重复标题与常驻长页脚。
- [x] 点击细节、双指锚点缩放、单指平移、双击/0 还原、键盘缩放/平移与 Escape 恢复；仅细节接管手势，全貌保留页面滚动和辅助缩放。多页与全屏暂存当前文件各页位置，文件变化清空；旧帧与迟到渲染保护保留。
- [x] 5 文件 37 项定向检查通过（文档边界 5、画布隔离/恢复 2、实际生成脚本 3、消息内嵌 4、消息路径 23）；收尾滚动隔离及迟到回调保护调整后，3 项脚本检查复查通过。执行生成脚本的 VM 和 Graph 替身不能证明真实 SVG、触摸及视觉效果。未增加全套测试。
- [x] 最终 `npm run typecheck` 退出 0，59 项菜单权限一致、模块边界 0 违规；隔离 Vite 构建 6472 模块、1 分 38 秒成功（`.run/mobile-drawio-final-build-20261101`），保留既有大 chunk/混合导入告警。另执行实际生产 chunk `DrawioPreview-Vipm5p9_.js` 内的独立函数，确认没有依赖父模块闭包，320×336 画布的 1600×900 负坐标样例 bounds 为 (12,84.75,296,166.5)，完整显示且有留白；仍为离线 Graph 替身验证。项目质量门禁 exit 0、JSON PASSED，9 项既有 API，executedCheckers 为空；OpenSpec strict 和 diff 通过。无后端或数据库变更，无整体 AI 编程架构契约变化，未重启。
- [x] 既有静态自动构建已发布代码 `141955ca1`，前端版本 `f3e800688e063eca4028c031`，实际公网版本资源 `DrawioPreview-CVWIHpJs.js` HEAD 返回 200。随后连续观察 62.6 秒，前端 PID 157436、后端 wrapper 50144 未变，受管重启次数保持 0，servicesReady=true，API 持续 200；本次没有执行服务重启。此证据确认资源已生效与服务稳定，不证明浏览器实际绘图。
- [ ] 手机竖/横屏及桌面使用真实宽流程图检查完整边界、文字细节、拖动/双指和全屏恢复。本次 Chrome 浏览器访问 Forge 被已有安全策略拒绝：该域名未获外网访问权限；未尝试其他浏览器、CDP 或隔离假页面绕过限制。手机/桌面预览入口已准备，WAITING_VIEWER_AUTH；实机绘图、布局与手势验收未完成，不能用上述资源及接口探测替代。
- [ ] 后续按真实需要增加章节/语义分区与跨区域连线定位；本期没有切片、自动语义识别或跨仓 Team Standards 宪法变更，也不开放原被阻止的外部资源加载。

## 原预览实施

- [x] 固定官方自包含 Viewer 资源、保留许可及校验值，避免重复加载内嵌 stencils。
- [x] 实现浏览器有界解析、隔离画布、多页、缩放、全屏与错误恢复。
- [x] 接入直接打开/拖拽和 Vibe Coding 工作目录完整文本预览。
- [x] 完成 17 项定向回归、类型检查、前端构建、质量门禁和隔离浏览器验收。
- [ ] 用户确认更新运行版本后核验正式入口；本次不自行重启或推送。

## 跨目录图文件修复（2026-10-29）

- [x] 核实报告文件、会话主目录和原生助手链接，区分读取拒绝与图形渲染失败。
- [x] 图片与 Draw.io 共用有类型的精确助手引用登记，接入已鉴权历史页及有界最近页兜底。
- [x] 图文件读取增加登录/会话权限校验，保持全局排除、类型、UTF-8、大小和跨会话隔离。
- [x] 25 项后端定向回归与 OpenSpec strict、原生质量门禁通过。
- [x] 受影响模块与宿主装配打包完成。
- [ ] 用户确认重启后核验正式会话入口及运行版本，完成稳定观察；本次未重启。

### 本次诊断与验证

- 报告对象为 `D:/projects/yoooni-agent/frontend/docs/diagrams/visit-current-sequence.drawio`。文件存在，69098 字节，XML 根为 mxfile、2 页；原会话 `50939b09-d1b3-4e29-8bdf-6f12668a07a8` 主目录仍是 application-starter。只读查询会话元数据，并在对应原生记录末尾 16 MiB 找到助手 Markdown 的精确 Draw.io 链接，没有修改会话或项目配置。目录校验拒绝发生在读取/XML 渲染前。
- Graphify 查询因既有图 713463271 字节超过 512 MiB 查询上限失败；未重建或提高上限，以定向源码、元数据、真实文件和历史记录补齐证据。
- JDK 21：`mvn -pl tools/tool-claude-chat -am test '-Dtest=SessionArtifactReferenceServiceTest,SessionFileControllerTest,SessionImageControllerTest,SessionLocalPathAccessServiceTest,CodexImportedHistoryTest,ConsultHistoryAuthorizationTest' '-Dsurefire.failIfNoSpecifiedTests=false' '-Dskip.frontend=true'`，6 文件、25 项通过，0 失败、0 跳过。涵盖精确跨目录文件、兄弟文件/其他会话/用户文本拒绝、直播尾页、有权历史页登记、原生句柄和账号隔离、原图片读取以及图类型/UTF-8/5 MiB 边界。
- 原生质量入口 `forge-quality.ps1 verify -Project . -Format json`：JSON status=PASSED、exit 0；静态 checker 为空、运行验证为 9 项既有 API，不代表新图文件链路在线验收。两个受影响 change 的 OpenSpec strict 通过。前端源码和渲染协议未变，不重复执行全量前端检查。
- JDK 21：`mvn -pl toolbox-starter -am package '-DskipTests' '-Dskip.frontend=true'`，41 模块宿主装配通过（2 分 20 秒）。核对宿主内嵌模块含新的精确引用 Bean，不含已更名的旧 Bean 类。该命令跳过其他模块测试及前端构建/复制，不宣称前端重新打包或新版运行验收。
- 手机/桌面 `/tools/claude-chat` 预览入口准备成功，均为 WAITING_VIEWER_AUTH，未执行新版登录页面验收。此前浏览器网络出口授权受限，本次未尝试绕过；后端新版本也尚未加载。
- 保持现有运行服务；未执行重启及新版本 60 秒稳定观察。本次不改变整体 AI 编程架构契约，无人工待执行 SQL。

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

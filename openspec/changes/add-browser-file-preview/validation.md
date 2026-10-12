# 验证范围

## 实际执行

- 前端定向 15 项通过：文件读取/格式/大小/编码/二进制/清理 5 项，拖放/选择/竞态/失败保留/关闭焦点/大文件源码 4 项，已有大纲 2 项、渲染根 1 项、目录 HTML 3 项。新增范围修改后重跑对应 9 项，未变化的 6 项证据复用。没有运行前端全套测试或后端构建。
- `npm run typecheck` 通过，含菜单目录及 feature 边界检查。
- `npx vite build --outDir dist/browser-file-preview-build` 通过（最终 42.59s），有既有大 chunk 警告。直接调用 Vite 避免 `assistant:release`，本轮未执行 SDK 本地发布脚本。
- `openspec validate add-browser-file-preview --strict --no-interactive` 通过。
- Forge CLI 全阶段退出码 0、JSON `status=PASSED`；9 项现有 API 场景通过。`executedCheckers=[]`，未执行 Java/SQL 静态检查器；该门禁不替代文件预览验收。

## 浏览器与运行

- 实际首页 `/tools/doc-viewer` 的直接打开区域可见，旧文档源保留。截图：本地 `.git/doc-drop-home.png`。
- 因 Edge 扩展未授权本地文件 URL，自动文件选择 `setFiles` 被拒绝。未变更扩展权限；实际系统文件选择与操作系统拖拽尚未自动化覆盖。
- 使用实际组件、真实浏览器 File/ArrayBuffer/TextDecoder/DataTransfer/DragEvent 的隔离样本页面验收 drop → 自动预览，不模拟文件读取结果或后端接口。校验 Markdown、Mermaid、深层大纲、文件切换、HTML 正文及内嵌样式（脚本未执行）、不支持格式、空文档、Esc/关闭焦点。
- 桌面 1440×900 窗口边界 `(24,24)–(1416,876)`，手机 390×844 无横向溢出；矮屏 1280×600 边界 `(24,24)–(1256,576)`、正文高 420px，关闭可达。
- 手机展开大纲后末尾正文可见，正文 `scrollTop=3966`、总高 4329px、可视高 363px；矮屏末尾 `scrollTop=3101.5`、总高 3521px、可视高 420px。
- 截图：本地 `.git/doc-drop-preview-desktop.png`、`.git/doc-drop-preview-mobile.png`、`.git/doc-drop-html.png`、`.git/doc-drop-error-mobile.png`；隔离样本产物在忽略的 `frontend/dist/`，不进入提交。渲染规则迁移到独立 helper 后，行为/界面未变，定向测试、类型及构建重新通过，复用对应界面证据。
- 使用现有 Vite 热更新，未重启服务、未制作后端嵌入包、未生产发布。前端受管 PID 28140 持续 ready、重启计数 0，首页 HTTP 200；起止复查间隔超过 60 秒。Vite 日志含既有测试 bundle 动态 import 警告和一次 WS 连接重置，未出现进程退出或重启增长。

本次不改变 AI 编程架构的上下文、权限、执行绑定或交付契约。工作区其他任务修改及 25 项暂存记录保持原样。

# 站点录制编排 · 录制面板设计补充

> 范围：[frontend/src/features/browser-request](../../src/features/browser-request)。仅记录 UI 行为约定，骨架架构见仓库根 `docs/design/architecture.md`。

## 录制资源类型开关

- 开始录制前，[RecordingPanel](../../src/features/browser-request/components/RecordingPanel.tsx) 顶栏暴露 4 个 checkbox：XHR / Fetch / Document / Script。
- 默认勾选 XHR + Fetch（业务接口主力），DOCUMENT / SCRIPT 默认关。一个都不勾时禁用「开始录制」按钮。
- 选项透传到 `POST /api/browser-request/sessions/{id}/recordings`（`StartRecordingBody.captureXhr/captureFetch/captureDocument/captureScript`），后端 `RecordingService.start` 拼 `CaptureFilter` 交给 `HttpRecorder`。
- 录制中切换勾选不影响进行中的录制；下次开录才生效。

## 响应体上限（前端动态选）

- 紧挨在 4 个 capture 开关下方，Segmented 控件四档：`256K / 2M / 8M / 32M` 字节。默认 `2M`。
- 选择透传到 `StartRecordingBody.responseBodyTruncateAtBytes`，后端 `RecordingService.start` 夹到 `BrowserRequestProperties.responseBodyMaxBytes`（默认 32 MB，硬上限）之内后塞进 `CaptureFilter`。
- 单条响应体行为：`len ≤ truncateAt → 全存`；`len > truncateAt → 截到 truncateAt + responseTruncated=true`；`content-length 已告知 > maxBytes → 不读 body 仅留元数据`。
- truncateAt 是「每次录制时一档」的常量，录制过程中不可改；UI 切换只影响下一次开录。

## 响应体一键复制

- `HttpCallCard` 响应体 `<details>` 标题右侧渲染独立 `CopyButton`（`navigator.clipboard.writeText`）。
- 复制成功后按钮短暂切换 Check 图标 + 「已复制」文字 1.2s，复用 `OutputBox` 的同款交互。
- 按钮 `onClick` 阻断冒泡，避免点击导致 `<details>` 误折叠。

## 响应体关键字检索

- `CallTimeline` 顶栏新增搜索输入 + 「仅显示命中」勾选。
- 命中判定：`HttpCallView.responseBody` 大小写不敏感包含关键字。Stream 视图（active 录制中）没有 body，搜索框 disabled。
- 命中卡片整张套 `border-amber-500 + ring-1`；响应体 `<pre>` 内的关键字片段用 `<mark>` 高亮（亮琥珀底）。
- 命中数显示「命中 X / N」。勾「仅显示命中」时过滤列表，未勾时全列表显示但命中卡片高亮。
- 关键字非空 + 卡片命中时，卡片默认展开以便看上下文。

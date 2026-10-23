# draw.io 前端预览

## Why

当前文件预览无法显示 draw.io 架构图，用户希望直接在 Forge 内查看，避免打开其他应用。

## What Changes

- 文档浏览器直接打开和拖拽支持 `.drawio` / `.drawio.xml`。
- 公共只读图形预览提供多页、缩放、适应窗口、全屏和错误恢复，Vibe Coding 工作目录复用。
- 固定版本 Viewer 和 stencils 静态资源随前端分发，无新服务或后端格式/权限变更。

## Impact

- 影响 doc-viewer、claude-chat 工作目录预览和前端静态资源。
- 无数据库、AI 上下文/证据流或服务生命周期契约变更；不影响 AI 编程整体架构。

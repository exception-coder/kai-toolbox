## Context

ChatPage.tsx 顶部 cc-session-identity 与 cc-session-header-tail 同为 flex-1；后者包含多个不可缩小元素，会溢出到 runtime-cluster。顶部站点 Popover 与现有站点页签重复。skin.css:183 起为现有顶部视觉规则。Graphify manifest 早于工作区修改，实施坐标以定向源码读取为准。

## Goals / Non-Goals

目标：去掉重复站点入口和药丸，避免顶部控件重叠，给标题留出可用空间。非目标：重构会话业务、改变监督状态条或全局导航。

## Decisions

- CONSERVATIVE：沿用项目 Quiet Luxury UI、现有按钮和 CSS tokens；用户 registry 无项目绑定且 core 尚无 established patterns。
- 站点使用已有 SessionSitesWorkspace，复用其打开和管理能力，并将原顶部复制动作提取为 SiteLinkCopyButton，在快捷站点和临时站点中提供。
- 标题独占弹性空间，右侧工具区按内容占宽，禁止反向溢出。
- 顶部建立 inline-size container，以实际宽度收起用量、传输细节及操作文字，保留可访问名称和原有菜单。
- 相比增加新工具栏，删除重复信息不会增加垂直层级。

## Risks / Trade-offs

- 站点快速打开增加一次页签切换；换取单一清晰入口。
- 工作区已有未提交修改；只编辑上述区域，不恢复或覆盖其他任务。
- 浏览器不可用时保留视觉验收待办，不将类型检查视为视觉通过。

## Verification / Rollback

运行 frontend typecheck、关联组件测试和 Forge quality all（MCP 不可用时 CLI）。检查桌面、窄容器和移动端。回滚仅撤销本 change 的局部 diff。

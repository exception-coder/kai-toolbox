## Why

待提交文件的双栏对比限宽 1024px，桌面长代码阅读空间不足。用户需要在原弹框内全屏查看。

## What Changes

- 标题栏提供全屏查看和还原窗口，切换保留当前文件及对比滚动位置。
- Esc 先还原全屏，再关闭窗口；使用现有 Radix Dialog 管理焦点和背景滚动。
- 只改变共享 Git 变更视图，不更改 Git 查询、写入或提交行为。

## Capabilities

### New Capabilities

- `git-diff-window`: 待提交文件窗口的全屏与还原交互。

## Impact

共享 components/git 弹层及其 Vibe Coding、项目入口。无后端、数据迁移或 AI 架构契约变化。

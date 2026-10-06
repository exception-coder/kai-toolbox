## Why
会话已有附加项目关联，但提交弹窗只显示主目录，跨仓开发无法查看关联项目的提交。

## What Changes
- 复用会话目录关联，在提交弹窗管理并选择关联仓库。
- 后端统一解析已关联仓库，每次查询重新核对关联和排除策略。

## Capabilities
### New Capabilities
- `session-git-push`: 沿用活动 add-session-commit-push 的能力名，增加关联仓库选择规则。

## Impact
影响会话 Git 控制器、仓库解析及提交弹窗。不新增数据库，不改变主 cwd 或代码写入权限。

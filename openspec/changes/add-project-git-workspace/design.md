## Context

ProjectRegistryPage 提供区域导航，ProjectRegistryService.require 解析已登记身份。GitLogService 提供通用查询，但现有文本 status 解析不适合特殊文件名，执行器也没有网络交互约束。本次不改变既有调用方。

## Goals / Non-Goals

目标为项目库内检查工作树及普通单分支推送。范围与非目标见 proposal。无需 DDL、依赖升级或新菜单 manifest。

## Decisions

- 新增 registry Git controller → focused application service → Git infrastructure adapter。只接受 project ID，路径从 Registry 获取并要求仓库根（含 worktree 的 .git 文件），不接受任意路径或命令。
- GET `/api/project-registry/{id}/git` 返回分支、HEAD、上游、ahead/behind、NUL porcelain 文件清单、最多 100 条待推送提交及总数。读取不 fetch，明确本地远端记录的时效边界。空仓库、detached、无上游返回可读阻断原因。
- POST 同路径 `/push` 接受 snapshot token。token 包含 HEAD、分支、上游、远端 push URL 与远端跟踪提交的散列。服务按仓库串行推送，重读后比较 token；显式推送已显示 SHA 到 refs/heads 目标，防止本机并发 commit 被意外推送。
- 使用已有 remote 配置的 push URL 集合，按顺序逐个推送固定 SHA，页面展示脱敏目标；不覆盖 GitHub/Gitee 等现有多目标配置。只有所有目标成功后才以旧 SHA 为条件更新本地跟踪引用；部分失败明确列出成功和失败目标，保留待推送状态供重试。fetch 地址未包含在推送集合时阻断，避免把另一仓库的跟踪引用当作依据。普通推送拒绝非快进，不执行 force、自动合并、自动 commit、额外 tag 或 submodule 推送；保留 Git hooks。跟踪更新失败返回成功附带刷新指引，避免把已成功推送误报为失败。
- 进程使用 argv、每个目标 60 秒超时、非交互认证和有界输出。失败回显脱敏信息；超时需提示先核对远端再重试。不以退出非零猜测空状态。
- 视觉采用 CONSERVATIVE：用户截图、现有 Button/Input 与 CSS tokens 为依据。设计 registry 已初始化但无项目 profile，global core 无已建立模式，不生成第二套视觉规范。左侧项目选择、右侧工作区；窄屏改为上下结构，文件与提交分别呈现。

## Risks / Trade-offs

- 多推送目标只有一份本地 upstream 跟踪记录 → 多目标允许在 ahead=0 时重试，防止 fetch 后失去同步次级地址的入口；仍只普通推送固定 SHA。

- 本地远端记录可能过时 → 标注文案，真实 push 由 Git 拒绝非快进；本次不提供 fetch/pull。
- 运行中的其他任务改变文件 → 保留当前工作区内容，提交前按块分离接入改动。
- 推送有远端副作用 → 本次测试使用临时 bare 仓库；不向真实项目远端执行验收 push。
- 大工作区 → 限制输出 2 MiB，超限明确失败而非伪造完整清单；待推送提交列表 100 条上限。

## Migration Plan

无持久化迁移。运行 backend 专项测试、frontend 测试/typecheck/build、宿主构建、Forge 门禁、桌面/移动浏览器及 60 秒稳定观察。回滚本次文件与导航接入即可。

## Open Questions

无。Git 行为依据 https://git-scm.com/docs/git-push 与 https://git-scm.com/docs/git-status（2026-09-13 核对，本机 Git 2.54.0）。

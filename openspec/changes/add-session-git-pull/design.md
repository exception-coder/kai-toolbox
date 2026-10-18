## Scope and decisions
主对象是 sessionId 下选择的仓库，仓库路径仍由 SessionGitRepositoryService 解析并经过 ProjectAccess；不接收浏览器提交的任意路径。不新建导航或复制项目清单。

采用现有弹框内的“拉取更新”按钮，与推送并列。点击先 POST pull-preview，仅 fetch 配置的上游分支并返回脱敏源、固定本地/远端提交、领先/落后数量及快照 token；随后用户确认才更新工作树。刷新推送状态依然是本地查询，不偷偷联网。拉取固定远端提交采用 merge --ff-only --no-autostash，避免用户 Git 配置改变策略；只拉当前分支，不递归更新子模块或标签。分叉、未提交/未跟踪文件、未完成合并或 rebase、detached HEAD、无上游明确拒绝，保留原文件。

GitPullOperations 为 common 稳定端口，projects 所有者实现拉取用例；claude-chat 控制器只做身份/请求适配。项目推送和会话拉取使用相同 canonical repository 锁，普通查询不占写锁。确认前重核分支、HEAD、上游 URL/引用和目标版本；变化即拒绝。锁不替代 Git 自身锁，不保证宿主终端并发操作安全，用户应先停止正在修改该仓库的 Agent/本机 Git 操作。

## Product principles
OBJ-01 / NAV-01：继承当前选中仓库，不增加页签或二次项目选择。
CTX-01：执行后保持当前目录并刷新提交及推送状态；Dialog 关闭后恢复焦点。
FEED-01 / CTRL-01：检查、确认、执行、成功/无变化/失败均明确显示；超时或断连提示先核对工作树再重试，不自动重复拉取。进行中禁止关闭、换仓和重复写操作。取消确认不撤销已完成 fetch，不修改工作树。
DENS-01：现有紧凑工具栏扩展按钮，窄屏自然换行，无多层弹框。
IDEM-01：身份是 canonical 仓库，token 固定本地与远端版本；并发拒绝，成功后旧 token 失效，重查后无新版本不执行更新。
EVID-01：远端信息只在检查后认为新鲜；源码、构建和目标服务验收分别记录。无原则例外。

## Verification
真实临时 bare 仓库验证快进、最新、分叉、脏文件、快照变化及共享锁；控制器验证选定/排除目录；组件验证确认、pending 保护、失败恢复及迟到结果。桌面和窄屏用真实组件验收，服务启动需本次明确授权。

## External contract
本机 Git 2.54.0.windows.1。按 Git 官方文档核对 fetch 后整合和 ff-only / no-autostash 的含义，查阅2026-10-18：[pull](https://git-scm.com/docs/git-pull)、[merge](https://git-scm.com/docs/git-merge)。这里只补安全快进闭环，分叉人工处理；不实现自动冲突消解或通用终端。

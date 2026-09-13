## Context

`AgentManagementPage` 管理 Registry、配置和版本，`EvalPage` 管理采集、评测及历史报告；目前分属两个 manifest。合并为一个前端 feature，后端仍通过各自 API 工作。采用现有 React Router、TanStack Query、语义色彩和组件，无新增依赖。Design Registry 存在但项目无 profile 绑定，采用全局 core + 项目 Quiet Luxury 约束，CONSERVATIVE 复用当前工作台。

## Goals / Non-Goals

目标为统一菜单、统一页面外壳、可分享的评测上下文和旧链接兼容。独立能力评测继续可用。非目标为改造执行器、数据库或候选发布凭证。

## Decisions

### Workspace and navigation

Agent 管理 manifest 注册主地址及旧 `/tools/eval`，删除 eval manifest。将 eval API、类型及页面迁入 `agent-management/evaluation`，避免跨 feature 内部依赖。新轻量 Workspace 负责页标题与两个导航视图，Registry 内容复用既有组件；评测按需加载。保持 Registry 挂载以免切换评测时丢失未保存草稿。

`section=evaluation` 选择评测中心；`agent`、`tab` 定位 Agent 详情；`dataset`、`run`、`base` 保存评测选择。状态归 Router，更新参数时保留无关参数，数据集变更清除旧结果选择。旧地址 replace 跳转并保留查询和 hash，避免返回循环。各 Agent 的题集 ID 来自快照，不建立重复 Agent/题集映射。全部评测入口允许选择非 Agent 能力。

### Recovery and evidence

API 失败显示可重试反馈，题集或执行器缺失时禁用运行并指向样本来源或全部评测；不自动切换成另一 Agent 的数据。通用回归结果不自动写入候选配置，保留既有门禁操作且明确它与通用评测的边界。

### Permission catalog

只从 manifest 重新生成权限目录，保留 Agent 管理权限码；旧评测地址归同一 Agent 管理权限。不会自动授权额外用户。仅有旧 `menu:eval` 权限的账号需要管理员授予 `menu:agent-management`，这是入口合并的已知权限影响。

## Risks / Trade-offs

### Viewport repair

Agent 管理页的自然高度中间容器截断了 Shell 分配的剩余高度，导致注册表和详情在高屏上提前结束。修复仅调整现有两个页面组件的布局：页头不收缩，列表承接剩余高度，桌面左右面板独立滚动；详情操作栏以弹性剩余空间落到底部，长内容仍可完整访问。窄屏采用单列页面滚动，不按固定顶栏像素计算视口。评测视图继续保留草稿挂载和独立滚动。无接口、数据或发布语义变更。

验收比较高屏、矮屏、窄屏及动态 resize 的真实 DOM 边界，检查工作区到底、操作可达、长内容滚动和切换草稿保持；不以仅通过编译或桌面宽度截图代替高度验收。

- 历史题集未纳入或无可用适配器：显示缺口并禁用开始按钮。
- 草稿丢失：Registry 不因视图切换卸载；Agent 更换时清理草稿。
- 误认发布凭证：在 Agent 来源的评测上下文中说明通用运行不验证候选完整配置。
- 同时存在其他工作区改动：只修改与暂存本 change 文件和生成目录的对应片段。

## Verification and migration

Vitest 覆盖统一导航、旧地址/查询保持、Agent 上下文、刷新及失败路径；执行 typecheck/build、Forge CLI all 门禁。浏览器检查桌面及移动视口、真实 API、旧入口与返回；源码开发模式通过 Vite 验证本次模块，核对前后端进程和启动日志并稳定观察至少 60 秒。回滚只需回退本次前端提交并重建；不迁移或删除评测数据。主规格同步与归档在实际验收后处理。

## Open Questions

无阻塞本切片的问题。可信候选版本评测仍需另行扩展执行契约，本切片不宣称完成。

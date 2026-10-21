# 审核后排队，限定展示修改自动提交

## 复用边界
RequirementRegistrationPort只登记PENDING_EXECUTION；Forge连续监督需要真实会话及OpenSpec绑定，不能向无绑定的一次性请求粘贴监督Skill并宣称已监督。因此复用现有无工具AgentOneShotRunner及需求池端口，为展示小改动补充[consult-suggestion-development](../../../.agents/skills/consult-suggestion-development/SKILL.md)。它是有界补丁工作流，不是新的通用Agent运行时，不支持后端或任意业务逻辑自动修改。

## 产品原则
适用OBJ-01/NAV-01：沿用同一建议对象和卡片，经公共端口关联需求池ID，不建平行需求系统。CTX-01：原文和编辑草稿保留，关闭恢复焦点。DENS-01：只增加状态、理由、提交短号。FEED-01/EVID-01：审核失败不默许，排队不等于开发，commit不等于发布。AI-01/CTRL-01：普通用户不能提供目录、命令、分支、凭据或审批结论，只能提交和重试本人失败审核。IDEM-01：用户提交键、consult-suggestion:建议UUID来源键、唯一执行行与条件领取共同防重。无原则例外。

## 审核、状态与事务
新建议保存与REVIEW_PENDING工作行同事务；旧记录没有执行行，不自动开发。单工作者15秒轮询，原子领取到REVIEWING；模型90秒超时，在事务外调用。审核综合原文和所有编辑字段，通过封闭枚举分类而非关键词黑名单；混合扩权请求整体拒绝REJECTED，其他系统和全平台需求也拒绝。未知输出或异常到REVIEW_FAILED，原提交人可重试，不产生开发任务。

审核通过后，同一数据库事务调用registerPendingExecutionOnce和保存任务关联：ACCEPT_SIMPLE到QUEUED，ACCEPT_COMPLEX到MANUAL_QUEUED。公共端口按来源生成稳定UUID，重复登记复用任务；跨工具不读表。失败回滚后记审核失败，不伪称已入队。

QUEUED领取为RUNNING，在~/.kai-toolbox/consult-development/建议UUID建立consult-suggestion/UUID分支，基于已提交HEAD，不包含当前未提交改动。源码根默认服务工作目录，可由toolbox.consult.suggestion-development.project-root指定，必须是咨询仓库且遵守ProjectAccess。任务不能改变目录。

## 硬约束与提交
模型无文件、终端、浏览器、凭据或发布工具。宿主只读取ImageLightbox、ConsultMessageActions、ConsultConversationRuntimeStatus、ConsultUpgradeNotice四个展示组件。补丁最多三个文件、六处唯一匹配、12000字符替换；禁止增删文件、修改测试或依赖。TypeScript AST检查只容许既有JSX文本、className/title/aria-label/placeholder/alt字符串属性和既有buttonClass字符串变动。权限条件、事件回调、API、导入或程序结构改变会被拒绝。

补丁独立语义审查后执行tsc、前端边界、咨询组件测试及Forge静态门禁（退出码和JSON状态）。验证错误带回模型，最多两次修正；提交阶段失败不重试。宿主使用真实Git作者及三段中文正文，不跳过hooks；提交后核对真实hash、提交文件与无残余tracked diff，才记COMMITTED并回写需求池READY_FOR_RELEASE，等待合并与运行验收，不能置DONE。

复杂或超出自动实现范围的已接受需求保留人工队列。中断时REVIEWING重新排队，RUNNING变FAILED并保留工作树，避免第二份提交。无源码、依赖、Git作者、质量门禁或模型时显式失败。宿主不自动merge/push/启动/重启/热加载/部署，当前checkout与运行版本不变。

## 界面及验证
沿用同一抽屉，展示状态、简短理由和提交短号，打开时15秒刷新；手机仍全宽单滚动，保留焦点、草稿、失败恢复。普通用户看不到技术路径或原始错误。本次自动开发为工程能力，不登记业务升级纸签。

## 清单专属后台开发会话
清单使用一个持久的业务开发会话ID `consult-suggestion-development`，每条记录同时绑定建议UUID；它承载现有队列的真实审核、编码、验证、修正、提交事件，不复制项目配置或新增通用Agent运行时。模型阶段改用现有runObserved并保存实际返回的engine executionSessionId，未返回时保留空值，不伪造原生会话身份。各阶段仍是隔离的无工具模型调用；此业务会话不是Vibe Coding原生连续Thread，也不是Forge监督绑定，不以会话日志声称具备这些能力。

后台单工作者串行消费需求，与页面挂载和关闭无关。需求清单和需求池同步三个状态：审核通过到PENDING_EXECUTION（待实现），领取且更新任务后到IN_DEV（实现中），验证和真实commit成功到READY_FOR_RELEASE（待发布）。待发布仍需要合并与运行验收，不等于上线；复杂需求仍待实现并注明人工接续，失败回到待实现并保留错误原因。只允许来源键与任务ID匹配的回写，不修改DONE/CANCELLED任务；回写异常保留真实提交号并明确待核对。

新增模块自己的consult_development_session/message表，以单调sequence倒序分页读取，默认最新50条，后续使用稳定before游标；新消息不会使已读旧页重复或丢失。GET `/api/fore-consult/suggestions/development-session?before=0`需要登录，只返回可公开的阶段、中文说明、建议ID及时间，不暴露原生引擎ID、源码、凭据、模型原始输出或工作目录。拒绝/审核失败同样保留阶段事实，不误算为已接收。

原需求抽屉提供“需求建议 / 开发会话”两个依附同一清单的视图，桌面卡片同时提供只读会话入口，手机共用全宽抽屉。开发会话打开时5秒刷新，关闭只停止观察，不能取消后台任务；返回仍保留反馈草稿和焦点。会话读取失败提供重试，不影响实际开发。内部命令仍固定，不因只读会话入口增加普通用户编码、管理员或资源权限。适用OBJ-01/CTX-01/FEED-01/CTRL-01/IDEM-01，无原则例外。

测试覆盖真实SQLite状态、登录和本人重试、旧建议不执行、未知决策关闭、拒绝不入队、来源幂等、补丁和AST范围、临时Git仓库实际检查与commit，以及前端状态。临时仓库仅模型响应为夹具，不证明真实模型效果；实际服务消费、模型及需求场景待授权启动目标版本后验收。

## 外部依据
2026-10-22查阅[OpenAI工具护栏](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)，副作用前按工具面校验，不能只依赖语义审核；本实现将模型输出限制为数据，写入和命令由固定代码控制。[Git worktree](https://git-scm.com/docs/git-worktree.html)支持独立工作树，本实现保留隔离分支而不改写当前checkout。

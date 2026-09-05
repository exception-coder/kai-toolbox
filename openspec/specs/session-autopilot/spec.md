# session-autopilot Specification

## Purpose
定义 Forge 会话绑定 OpenSpec change 后的连续执行、双层监督、完成边界、恢复控制与可观察性要求。
## Requirements
### Requirement: 用户显式控制单会话自动推进
系统 SHALL 允许用户为一个标准开发会话配置目标和完成条件并显式启用自动推进，且 MUST 默认关闭。系统 SHALL 允许用户随时暂停、恢复或终止运行，不得将一次启用扩散到其它会话。

#### Scenario: 空闲会话启用自动推进
- **WHEN** 用户为一个空闲标准开发会话提交非空目标并启用自动推进
- **THEN** 系统创建新的自动推进运行代次并开始一次目标评估轮
- **AND** 页面展示运行目标、状态、已用自动轮数和停止上限

#### Scenario: 运行中会话启用自动推进
- **WHEN** 用户在当前轮仍运行时启用自动推进
- **THEN** 系统只监控当前轮并等待权威终态
- **AND** 不向活动轮次并发插入新的继续消息

#### Scenario: 用户主动接管
- **WHEN** 用户在自动推进活动期间手工发送、追加或排队消息
- **THEN** 系统先暂停当前自动推进运行并记录 `USER_TAKEOVER`
- **AND** 用户消息继续按现有会话发送门禁处理

### Requirement: Forge 显式绑定并展示 OpenSpec Execution Context
严格 OpenSpec 自动推进运行 MUST 显式绑定当前会话、已校验项目根目录、仓库与分支快照、OpenSpec change、当前 task、执行阶段、Agent session 和运行代次。Forge MUST 在派发 task 前记录 `currentTaskId`，不得从 Agent 自然语言回复推断当前 task 或 change。

#### Scenario: 用户绑定活动 change
- **WHEN** 用户为标准开发会话选择项目中的一个活动 OpenSpec change 并启用严格自动推进
- **THEN** 系统校验项目路径和 change 身份后持久化版本化 Execution Context
- **AND** 页面展示项目、分支、change、绑定 specs、当前阶段和任务进度

#### Scenario: Forge 派发当前 task
- **WHEN** Runtime 选择一个可执行 OpenSpec task
- **THEN** 系统先持久化该 task 的人类可读 checklist key、OpenSpec apply 序号、change revision、尝试次数和运行代次，再向原 Agent session 派发
- **AND** 重连、回放或重启不能把其它 pending task 误认为当前 task

#### Scenario: 当前 task 在回合结束后仍未完成
- **WHEN** Agent 回合结束且绑定 `currentTaskId` 在权威 OpenSpec task 状态中仍未勾选，同时不存在允许暂停的 blocker
- **THEN** Runtime 继续派发同一 task 而不是选择后续 task
- **AND** 不根据回复中的“下一阶段”或“后续可以”改变 task 身份

#### Scenario: 当前 task 完成后选择下一项
- **WHEN** Runtime 重新读取后确认当前 task 已勾选且 change 仍有 pending task
- **THEN** 系统按 OpenSpec apply 返回顺序选择首个未完成 task，并在派发前持久化其身份
- **AND** 不创建或读取平行的 Forge task 清单来覆盖 OpenSpec 顺序

#### Scenario: 执行上下文发生漂移
- **WHEN** 项目、仓库、分支、change 或 Agent session 与持久化 Execution Context 无法安全对应
- **THEN** 系统暂停并标记 `EXECUTION_CONTEXT_DRIFT`
- **AND** 展示重新绑定、重试或终止动作，不自动猜测替代 change

### Requirement: Agent Skill 与 Forge Runtime 提供两层连续执行兜底
系统 SHALL 为严格 OpenSpec 运行激活版本化的 Forge Continuous Execution Skill，并 MUST 由 Forge Runtime 独立复核每个权威回合终态。Skill 输出 SHALL 作为不可信候选证据；只有 Runtime 可以派发下一轮或宣布运行完成。

#### Scenario: Agent 在同一轮内发现明确下一步
- **WHEN** Continuous Execution Skill 检查到当前 change 仍有可自行执行的工作
- **THEN** Agent 继续执行下一步骤或通过结构化进度工具报告当前 task 和下一动作
- **AND** 不以“阶段完成”作为整个运行的最终回复

#### Scenario: Agent 提前结束但当前 task 未完成
- **WHEN** Agent 产生正常 `end_turn`，但 Runtime 重新读取后发现当前 task 仍 pending 且没有 blocker
- **THEN** 系统记录 `SKILL_CONTRACT_VIOLATION` 并自动续跑原 Agent session 的同一 task
- **AND** 该回合只显示为中间阶段结束，不显示为自动监督完成

#### Scenario: Agent 提前结束且存在后续 task
- **WHEN** 当前 task 已完成但 change 仍有下一个可执行 task
- **THEN** Runtime 持久化下一个 task 后自动续跑原 Agent session
- **AND** 不要求用户发送“继续”

#### Scenario: Skill 未加载或版本不匹配
- **WHEN** Sidecar 能力快照无法证明所需 Continuous Execution Skill 已加载
- **THEN** 页面将第一层兜底标记为不可用或版本不匹配
- **AND** Runtime 不伪造 Skill 已生效，并按安全策略拒绝启用或暂停现有严格运行

#### Scenario: 项目存在同名非 Forge Skill
- **WHEN** 目标 Skill 位置存在同名文件但没有 Forge 所有权元数据
- **THEN** 系统拒绝覆盖并暂停启用流程
- **AND** 展示冲突路径和由用户重命名、移除或取消启用的恢复动作

### Requirement: 权威终态触发下一步判定
系统 MUST 仅在 Sidecar 已完成轮次清理、会话状态一致、没有待确认请求且没有后台任务时判定可推进。普通引擎 `end_turn` SHALL 只表示本轮结束，不得单独表示目标完成。

#### Scenario: 收到成功回合终态
- **WHEN** Sidecar 发布带稳定 turn ID 的成功终态且全链路状态为可发送
- **THEN** 系统对该 turn ID 至多执行一次自动推进处置
- **AND** 在处置完成前不得启动下一自动轮

#### Scenario: 仍有后台任务
- **WHEN** 可见回合已经结束但会话后台任务快照非空
- **THEN** 系统保持当前自动推进运行并等待后台任务清零
- **AND** 不发送继续消息也不宣告目标完成

#### Scenario: 状态证据不一致
- **WHEN** Java、SQLite 或 Sidecar 对会话是否空闲的判断不一致或状态已过期
- **THEN** 系统暂停推进并展示一致性原因与恢复动作
- **AND** 不依靠旧快照推定会话空闲

### Requirement: Agent 使用结构化处置报告进度
自动推进运行中的 Agent MUST 通过受控进度报告能力提交 `CONTINUE`、`COMPLETE`、`WAITING_USER`、`BLOCKED` 或 `FAILED` 之一，并提供进展摘要、下一动作或完成证据。系统 MUST NOT 解析自然语言尾部标记来替代结构化处置。

#### Scenario: Agent 报告继续
- **WHEN** Agent 为当前运行代次和当前轮报告 `CONTINUE` 及非空下一动作
- **THEN** 系统保存处置和进展证据
- **AND** 在全部门禁通过后生成一条可审计的自动继续消息

#### Scenario: Agent 报告完成
- **WHEN** Agent 报告 `COMPLETE`
- **THEN** 系统进入完成证据校验而不是立即停止
- **AND** 只有当前完成策略的全部门禁通过后才标记运行完成

#### Scenario: 缺少结构化处置
- **WHEN** 启用前已经开始的首轮以成功终态结束但没有进度报告
- **THEN** 系统最多生成一次目标评估轮以建立结构化处置
- **AND** 不并发插入普通继续消息

#### Scenario: 严格运行的自动轮缺少处置
- **WHEN** 严格 OpenSpec 自动轮缺少进度报告但权威 current task 仍未完成且没有 blocker
- **THEN** Runtime 记录 `SKILL_CONTRACT_VIOLATION` 并在重试预算内继续同一 task
- **AND** 连续三次没有新增任务或验证证据时暂停并标记 `OUTCOME_MISSING`

### Requirement: 自动继续消息可审计且幂等
系统 SHALL 将每条自动继续消息与运行 ID、运行代次、前序 turn ID 和自动轮次序号关联。系统 MUST 保证同一运行代次的同一前序 turn ID 至多触发一条自动继续消息，并在用户可见历史中明确标记该消息由自动推进生成。

#### Scenario: 重复收到轮次终态
- **WHEN** 后端因重连、回放或重复回调再次收到已处置的 turn ID
- **THEN** 系统返回既有处置结果且不创建第二条继续消息

#### Scenario: 浏览器不在线
- **WHEN** 自动推进运行活动且没有浏览器观察者
- **THEN** 服务端仍可保存并调度满足门禁的自动继续消息
- **AND** 用户重新连接后能够查看每一步的来源和处置记录

### Requirement: 人工决策和权限边界优先
自动推进 MUST 继承会话既有执行策略和权限模式，不得提高权限、代填凭据、替用户回答问题或替用户批准尚未由既有策略自动处理的权限请求。

#### Scenario: 会话等待用户回答
- **WHEN** 当前轮产生未决问题、权限确认或凭据输入请求
- **THEN** 自动推进进入 `WAITING_USER`
- **AND** 页面提供进入目标会话并处理请求的恢复动作

#### Scenario: 会话已经启用既有自动许可
- **WHEN** 用户此前显式启用的权限模式能够按现有策略自动裁决某项请求
- **THEN** 自动推进不改变该策略的裁决结果
- **AND** 不额外扩大工具或目录权限

#### Scenario: 只读会话尝试启用
- **WHEN** 用户对业务咨询、公开评审或其它只读执行策略会话启用自动推进
- **THEN** 系统拒绝启用并说明该能力仅支持标准开发会话

### Requirement: 自动推进具有不可静默放宽的停止预算
系统 MUST 为每次运行设置最大自动轮数和最长运行时间，SHALL 检测连续无进展或重复下一动作，并 SHALL 在任一保护条件命中时暂停。运行中的保护参数只能保持或收紧，不得静默放宽。

#### Scenario: 达到自动轮数上限
- **WHEN** 下一次继续将超过该运行的最大自动轮数
- **THEN** 系统暂停运行并标记 `TURN_LIMIT_REACHED`
- **AND** 等待用户检查证据后显式决定是否以新代次恢复

#### Scenario: 达到最长运行时间
- **WHEN** 当前时间达到运行截止时间
- **THEN** 系统不再启动新的自动轮并标记 `TIME_LIMIT_REACHED`

#### Scenario: 连续没有可观察进展
- **WHEN** 连续三次处置具有相同的剩余工作证据和下一动作指纹
- **THEN** 系统暂停运行并标记 `NO_PROGRESS`
- **AND** 展示最近三次处置供用户判断

### Requirement: OpenSpec 运行以完整生命周期作为完成边界
当自动推进绑定 OpenSpec change 时，系统 MUST 按 `APPLY`、`VERIFY`、`QUALITY_GATE`、`STRICT_VALIDATE`、`ARCHIVE` 和 `DONE` 推进。系统在接受 `COMPLETE` 前 MUST 确认目标 change 存在、planning artifacts 完整、任务清单没有未完成项、实现与规格一致、项目 Verification Barrier 通过、严格校验通过且 change 已按授权策略归档。门禁失败 SHALL 转为继续修复或暂停，不得把阶段结束、测试通过、verify 通过或“可归档”伪造为完成。

#### Scenario: OpenSpec 任务尚未完成
- **WHEN** Agent 报告 `COMPLETE` 但绑定 change 仍有未勾选任务
- **THEN** 系统拒绝完成并将剩余任务摘要作为下一轮输入

#### Scenario: OpenSpec 严格校验失败
- **WHEN** 绑定 change 的严格校验返回非成功状态
- **THEN** 系统拒绝完成并在预算允许时要求修复校验问题

#### Scenario: 质量验证证据过期
- **WHEN** 最近一次质量验证成功后工作区内容发生变化
- **THEN** 系统不得复用该成功结论
- **AND** 应重新验证或暂停并标记验证证据缺失

#### Scenario: 严格门禁全部通过
- **WHEN** Agent 报告 `COMPLETE` 且 OpenSpec、任务、实现核对、新鲜质量证据和严格校验全部满足
- **THEN** 系统按启动时的明确授权执行 OpenSpec archive 并确认主 specs 同步及活动 change 移出
- **AND** 只有归档确认后才将运行标记为 `COMPLETED` 并允许最终完成回复

#### Scenario: 未授权自动归档
- **WHEN** 其它完成门禁已通过但本次运行没有自动归档授权
- **THEN** 系统进入 `WAITING_USER` 并标记 `ARCHIVE_APPROVAL_REQUIRED`
- **AND** 不把“准备归档”显示为已完成

#### Scenario: 验证失败但可在范围内修复
- **WHEN** VERIFY、Verification Barrier 或严格校验失败且失败属于当前 change 范围并未达到重试上限
- **THEN** 系统返回 `APPLY` 阶段，派发明确修复 task 并在修复后重跑失败门禁
- **AND** 不要求用户确认可自行处理的修复

### Requirement: 服务重启后安全恢复活动运行
系统 SHALL 持久化自动推进当前状态和逐轮处置记录，并在服务启动或 Sidecar 重连后重新核对活动运行。恢复过程 MUST 先检查真实会话状态和幂等记录，不得盲目重放上一条自动消息。

#### Scenario: 重启时会话仍在运行
- **WHEN** 服务重启后发现自动推进活动且 Sidecar 报告相同 turn ID 仍在运行
- **THEN** 系统恢复监控而不发送新消息

#### Scenario: 重启时存在未处置成功终态
- **WHEN** 服务重启后确认会话空闲且最后成功 turn ID 尚未处置
- **THEN** 系统从完成判定步骤继续
- **AND** 幂等约束保证不会重复创建继续消息

#### Scenario: 无法确认恢复状态
- **WHEN** Sidecar 不可达、会话句柄缺失或 turn ID 无法对应
- **THEN** 系统暂停运行并标记 `RECOVERY_UNCONFIRMED`
- **AND** 提供重连、检查会话或终止运行的恢复动作

### Requirement: 用户能够理解当前状态并恢复工作流
系统 SHALL 以紧凑的会话内控件展示自动推进状态、目标、绑定项目和分支、change、delta specs、当前 task、OpenSpec 阶段、自动轮数、用时、最近进展、两层兜底状态、完成证据等级和暂停原因。所有非完成终态 MUST 提供暂停、恢复、进入待处理项或终止中的适用恢复动作。

#### Scenario: 自动推进正在工作
- **WHEN** 自动推进处于监控、评估或运行状态
- **THEN** 会话状态区展示当前阶段和已用预算
- **AND** 不使用遮挡消息阅读的大型状态卡片

#### Scenario: 查看当前会话绑定规格
- **WHEN** 用户展开当前会话的 OpenSpec 绑定信息
- **THEN** 页面展示 change ID、受影响 capability 和 delta spec 相对路径、当前 task 标题、已完成/总任务数及当前完成门禁阶段
- **AND** 展示 Agent Skill 与 Forge Runtime 是否分别生效及最后刷新时间

#### Scenario: 当前会话没有绑定 change
- **WHEN** 会话未绑定 OpenSpec change
- **THEN** 页面明确展示“未绑定 OpenSpec”而不是猜测最近活动 change
- **AND** 提供从当前项目活动 changes 中显式选择并绑定的动作

#### Scenario: 绑定规格暂时不可读取
- **WHEN** 已绑定 change 的实时规格快照读取失败或已过期
- **THEN** 页面保留最后成功快照并标记过期时间和原因
- **AND** 提供重试、重新绑定或终止监督的恢复动作

#### Scenario: 自动推进暂停
- **WHEN** 运行因提问、权限、失败、无进展或预算而暂停
- **THEN** 页面展示具体原因、最近证据和下一恢复动作
- **AND** 用户可以终止运行或在解决原因后以新代次恢复

#### Scenario: 自动推进完成
- **WHEN** 运行通过完成门禁
- **THEN** 页面展示完成摘要和证据等级
- **AND** 不再生成任何自动消息

### Requirement: 用户能够从跨会话看板监督所有自动推进运行
系统 SHALL 在 claude-chat 内提供“自动监督会话看板”，集中展示当前用户有权访问的自动推进运行。看板 MUST 默认只展示正在监督的会话，并 SHALL 将需要人工处理、已暂停和最近结束的运行作为明确的独立范围，不得把普通会话运行状态等同于自动监督状态。

#### Scenario: 查看正在监督的会话
- **WHEN** 用户打开自动监督会话看板
- **THEN** 系统默认展示处于 `MONITORING`、`RUNNING` 或 `EVALUATING` 的运行及监督中总数
- **AND** 每行至少展示会话标题和项目、引擎、目标或绑定 change、当前阶段、自动轮数与用时预算、最近进展和最后活动时间

#### Scenario: 查看需要处理的会话
- **WHEN** 用户切换到“待处理”范围
- **THEN** 系统展示处于 `WAITING_USER` 或因安全、预算、恢复问题暂停且存在用户恢复动作的运行
- **AND** 每行展示具体原因和进入目标会话的操作

#### Scenario: 搜索和筛选监督运行
- **WHEN** 用户按会话标题、项目、目标或绑定 change 搜索并选择监督范围
- **THEN** 系统在服务端应用搜索、访问控制和范围条件
- **AND** 返回稳定分页的匹配结果与各范围汇总计数

#### Scenario: 从看板进入目标会话
- **WHEN** 用户选择某个监督运行的“进入会话”操作
- **THEN** 系统导航到既有会话工作区并恢复该会话的正常运行上下文
- **AND** 不因查看或导航而暂停自动推进

#### Scenario: 从看板控制运行
- **WHEN** 用户在看板执行当前状态允许的暂停、恢复或终止操作
- **THEN** 系统使用运行版本进行冲突检查并更新该行
- **AND** 若另一个客户端已推进到更新版本，则撤销乐观结果、显示冲突并重新读取权威状态

#### Scenario: 没有正在监督的会话
- **WHEN** 当前用户没有处于监督中范围的运行
- **THEN** 看板说明当前没有正在监督的会话
- **AND** 提供返回会话列表以选择并启用自动推进的恢复动作

### Requirement: 监督看板使用有界且可收敛的权威快照
系统 MUST 通过服务端聚合投影返回看板数据，并 MUST 在应用访问策略过滤后执行有界分页。前端 MUST NOT 为每一行分别请求会话自动推进或运行态。WebSocket 更新 SHALL 只作为失效提示，REST 快照仍是权威来源。

#### Scenario: 监督状态发生变化
- **WHEN** 任一可访问运行的状态、预算、进展或恢复原因发生变化
- **THEN** 系统发布不含敏感运行内容的看板修订提示
- **AND** 正在显示看板的客户端重新读取受影响的权威快照

#### Scenario: 客户端错过更新提示
- **WHEN** 浏览器断线后重新连接或未收到某次修订提示
- **THEN** 客户端通过可见性恢复或低频兜底刷新重新读取 REST 快照
- **AND** 页面展示快照时间以便用户识别数据新鲜度

#### Scenario: 看板查询失败
- **WHEN** 新快照暂时无法读取
- **THEN** 页面在有缓存时保留最后一次成功数据并明确标记其时间和过期状态
- **AND** 提供重试操作而不是显示无恢复路径的空白页

#### Scenario: 监督运行数量超过单页上限
- **WHEN** 匹配运行数超过服务端页面大小上限
- **THEN** 系统返回稳定游标和下一页指示
- **AND** 不执行无界全表读取或客户端全量过滤

### Requirement: 会话监督状态使用规范接口路径读取
系统 SHALL 通过规范的会话自动监督状态接口读取当前运行，并 MUST 保持客户端基础路径与功能路径只组合一次。

#### Scenario: 读取当前会话监督状态
- **WHEN** 页面请求会话的自动监督状态
- **THEN** 客户端向 `/api/claude-chat/sessions/{sessionId}/autopilot` 发送一次鉴权 GET 请求
- **AND** 请求路径不得包含重复的 `/api/api` 前缀

#### Scenario: 当前会话没有监督运行
- **WHEN** 规范状态接口返回 HTTP 204
- **THEN** 页面将当前运行解释为未启用而不是请求失败


import { ArrowRight, Bot, Database, FileCheck2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

const tools = [
  { name: 'prepare_sql_context', title: '写 SQL 前，先准备表结构证据', input: '变更目的、目标表、必要时选择项目', path: 'POST /pending-sql/prepare-context', output: '返回结构证据与 evidenceId，供后续 SQL 登记关联。', limit: '项目或证据未确认时需继续核对，不能把工具调用成功当作 SQL 正确。' },
  { name: 'register_pending_sql', title: '把数据库改动存成待执行台账', input: '标题、DDL/DML、目标环境、多库 targets、可选证据 ID', path: 'PUT /pending-sql/auto-register', output: '关联当前会话的 SQL 记录，供「待执行 SQL」管理与复核。', limit: '登记不执行 SQL；缺少 VERIFIED 证据仍可登记为待复核，不能把登记当成已验证或已上线。' },
  { name: 'register_affected_apis', title: '把改过的接口登记到需求变更', input: '方法、路由、源码位置、变更类型及验证记录', path: 'PUT /affected-apis/auto-register', output: '登记到当前会话绑定的 OpenSpec change，供接口影响与验证跟踪。', limit: '上报的验证状态需要证据核对；不是自动扫描出所有接口，也不是登记后自动调用接口测试。' },
  { name: 'report_session_progress', title: '让服务端知道这一轮做到了哪里', input: '处置建议、摘要、下一步、剩余工作、证据', path: 'POST /autopilot/progress', output: '写入当前监督运行，回合结束后由监督器决定下一步。', limit: '需要有效的监督运行；报告本身不续跑、不扩大权限、不宣布整个目标完成。' },
] as const

const groups = [
  ['需求与项目', '把业务材料带进开发会话', '关联核心规格、初始化规格、TDD / 执行计划；附加文档与附件；工作目录、文件树、Git 状态和提交；合并工作区、拉取项目、项目初始化流水线。', '入口：关联规格、文档、工作目录、Git、项目菜单。需要已有材料、仓库或相应项目配置。', 'ChatPage / SessionDocumentsWorkspace / PrdLinkPanel / TaskspacePanel / OnboardPipelinePanel'],
  ['自动推进', '按变更任务持续派工与收口', '绑定 OpenSpec、当前任务与阶段；内部队列续跑；预算与暂停恢复；监督看板、质量门禁与授权归档。', '入口：自动推进 / 监督看板。需要活动 change、运行中的服务端及可用引擎；不是新建会话就自动监督。', 'SessionAutopilotService / OpenSpecContinuousRunner / QueuedChatMessageService'],
  ['数据与接口证据', '把代码之外的数据库和接口改动留下来', 'SQL 上下文准备、待执行 SQL 台账、多库目标；OpenSpec 接口影响登记；数据库阅读工作区与配置后的测试验证工具。', '入口：待执行 SQL / 数据库 / OpenSpec 变更。登记、实际执行、验证通过是三个不同状态。', 'SessionPendingSqlService / OpenSpecAffectedApiEvidenceService / SessionDatabaseWorkspace'],
  ['评审与业务参与', '把澄清和评审接回研发会话', '分享计划评审、收集文字与附件反馈并带回实现；受约束会话委托；业务问题回答、风险审批；SDK 与 Spring Boot Relay 接入。', '入口：分享计划评审 / 评审 / 委托。评审流与委托是不同工作流；评审可以有独立会话，不等于自动监督另开了一个监督会话。', 'ReviewSpaceService / ReviewIntentService / SessionDelegationService'],
  ['执行与恢复', '统一呈现引擎状态和待处理动作', '引擎与模型配置、权限模式、问题和审批交互；消息排队、中断、历史恢复、多会话分屏、工具执行轨迹与运行健康提示。', '入口：会话配置 / 队列 / 历史 / 多会话 / 轨迹。各引擎支持范围不同，执行策略可能进一步收紧权限。', 'ClaudeChatService / SessionRuntimeHealth / TrajectoryView / MultiSessionView'],
  ['成果与沟通', '把研发产物交给协作方查看', '关联测试站点；会话用量、Token 与费用明细；PDF / Word 导出；完成通知；语音输入、悬浮会话等交互入口。', '入口：站点 / 会话用量 / 导出会话 / 通知设置。关联地址不等于已经部署，费用和状态以可取得的数据为准。', 'SessionSitesWorkspace / UsageWorkspace / ExportSessionDialog / NotifySettings'],
  ['能力与环境诊断', '看到当前会话究竟能调用什么', 'MCP 工具、Plugins、Skills、子代理与命令目录；来源、作用域、连接状态、刷新时间；团队依赖与服务商诊断。', '入口：会话能力 / 团队依赖 / 服务商。仅配置、已连接、工具清单已核验是不同层次；项目插件不是 Forge 固定内置。', 'SessionCapsPanel / PluginPanel / ProviderDiagPanel'],
] as const

export function SessionCapabilityCatalog() {
  return <section className="execution-overview" id="session-capabilities" aria-labelledby="session-capabilities-title">
    <h2 id="session-capabilities-title">除了让 AI 写代码，Forge 还接好了什么？</h2>
    <p className="guide-note">继续用施工比喻：AI 是施工人员，Forge 还提供派工台、材料台账、检查入口和协作窗口。下面按当前代码中的入口盘点；可用能力取决于引擎、项目配置与权限。</p>
    <div className="capability-map" aria-label="Forge 会话能力全景">
      <div><FileCheck2 size={24} /><strong>派工台</strong><span>需求文档 · OpenSpec · 自动监督</span></div>
      <div><Database size={24} /><strong>材料与检查</strong><span>SQL 台账 · 接口证据 · 测试环境</span></div>
      <div><Users size={24} /><strong>协作窗口</strong><span>业务评审 · 委托 · 站点与成果</span></div>
      <div><Bot size={24} /><strong>执行工作台</strong><span>引擎 · 队列 · 权限 · 能力诊断</span></div>
    </div>
    <details className="guide-disclosure" open><summary>四个 Forge 工具：每次调用具体落在哪里？</summary>
      <p className="guide-note">共同链路：Agent 调用 → Claude SDK 工具 / Codex MCP 桥 → 会话绑定的 Java API → 业务服务保存或返回结果。下面路径前缀均为 /api/claude-chat/sessions/{'{sessionId}'}，会话编号由接入层绑定。</p>
      {tools.map(tool => <details className="guide-disclosure" key={tool.name}><summary>{tool.title} <code>{tool.name}</code></summary><dl className="guide-methods"><div><dt>提交什么</dt><dd>{tool.input}</dd></div><div><dt>服务端入口</dt><dd><code>{tool.path}</code></dd></div><div><dt>得到什么</dt><dd>{tool.output}</dd></div><div><dt>使用边界</dt><dd>{tool.limit}</dd></div></dl></details>)}
      <p className="guide-note">注入条件：依赖后端连接、会话策略及 forgeSqlRegistration 开关。Claude 路径在咨询只读模式下不注入接口影响登记；review-only / disabled 等策略会限制工具注入。不能把四个定义等同于每条会话都能调用。</p>
    </details>
    <details className="guide-disclosure"><summary>业务系统工具：查真实测试数据，调用测试接口</summary><dl className="guide-methods">
      <div><dt>erp_db / srm_db / scm_db · query</dt><dd>ERP Oracle、SRM / SCM MySQL 测试库的只读查询，用于核对结构与样本数据；工具说明限定 SELECT / WITH、最多 200 行。需要配置对应数据源。</dd></div>
      <div><dt>erp_app / srm_app · http_call</dt><dd>经后端向配置的本地或测试实例发送带登录态的 HTTP 请求，可与只读查询配合验证。允许写操作，不能当只读查询使用；未配置实例不可用，咨询只读模式不注入此类调用。</dd></div>
      <div><dt>其他环境能力</dt><dd>welfare_db 是演示场景专用；项目或 Auth 目录提供的 Skills、MCP、Plugins 另行加载。Graphify、质量门禁等不能仅因在目录中看到名字就认定已经连接并可用。</dd></div>
    </dl><p className="guide-note">实现入口：toolboxMcpBridge.ts、forgePendingSql.ts、sessionManager.ts、codexMcpPolicy.ts。数据库和测试站点是可选集成，缺少配置不代表普通代码会话不能使用。</p></details>
    <details className="guide-disclosure"><summary>完整会话工作台：按使用场景查能力与入口</summary>{groups.map(([name, title, description, condition, source]) => <details className="guide-disclosure" key={name}><summary>{name} · {title}</summary><p className="guide-note">{description}</p><p className="guide-note">{condition}</p><p className="guide-note">代码入口：{source}</p></details>)}</details>
    <details className="guide-disclosure" open><summary>和直接新建一个 Codex 会话有什么区别？</summary>
      <p className="guide-note">Codex 本身可以使用 Skills 和 MCP，也具备开发执行能力。Forge 的增量是接入本产品的数据、业务流程和协作界面；相同集成也可以另行配置或开发到其他客户端中。</p>
      <div className="guide-table-scroll" tabIndex={0} role="region" aria-label="Forge 与直接使用 Codex 的区别"><table><thead><tr><th>你要完成的事</th><th>直接使用 Codex</th><th>Forge 已实现的接线</th></tr></thead><tbody>
        <tr><td>讨论、读代码、修改与测试</td><td>依靠引擎及当前工具环境开展</td><td>在会话工作台统一组织；不会因此让同一模型天然更聪明</td></tr>
        <tr><td>接团队规范与业务工具</td><td>可配置 Skills / MCP</td><td>按会话注入 Forge 工具，绑定后端服务，显示能力来源与运行状态</td></tr>
        <tr><td>跟进一条需求的持续执行</td><td>可按文档与指令推进；本产品的绑定和台账需额外接入</td><td>持久化 OpenSpec 运行，按回合事件续跑、暂停、门禁与归档</td></tr>
        <tr><td>交接 SQL、接口影响和业务反馈</td><td>可生成材料或经工具集成保存</td><td>保存为会话 / change 关联记录，并有业务管理与评审入口</td></tr>
        <tr><td>让业务人员受限参与</td><td>本产品的用户授权、公开协议和 Relay 需要另外接入</td><td>Session Grant、业务问答、所有者审批、公开客户端与 Starter</td></tr>
      </tbody></table></div>
      <p className="guide-note">只做一次代码修改，两者可能相近；需要在本产品内跟踪需求、数据库改动、验证与业务协作时，Forge 的价值是减少重复接线和人工整理。原生功能参考：<a href="https://developers.openai.com/codex/skills">OpenAI Skills 文档</a>、<a href="https://developers.openai.com/codex/mcp">OpenAI MCP 文档</a>。</p>
    </details>
    <div className="guide-actions"><Link to="/tools/claude-chat">进入会话，打开「会话能力」核对当前配置<ArrowRight size={16} /></Link><a href="#app-server-flow">查看自动监督事件实现<ArrowRight size={16} /></a></div>
  </section>
}

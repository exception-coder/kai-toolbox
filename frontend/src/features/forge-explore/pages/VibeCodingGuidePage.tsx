import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ExecutionOverview } from '../guide/ExecutionOverview'
import { AppServerExecutionFlow } from '../guide/AppServerExecutionFlow'
import { SessionCapabilityCatalog } from '../guide/SessionCapabilityCatalog'
import '../showcase.css'
import '../guide/guide.css'

const sections = [['relationship', '两种能力'], ['openspec', '文档如何驱动执行'], ['binding', '绑定如何实现'], ['supervision', '自动监督闭环'], ['phases', '完成的依据'], ['constraints', '权限执行链'], ['start', '开始使用']] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="guide-section" aria-labelledby={`${id}-heading`}><div className="guide-section-title"><h2 id={`${id}-heading`}>{title}</h2></div>{children}</section>
}

function Chain({ title, nodes }: { title: string; nodes: readonly (readonly [string, string])[] }) {
  return <figure className="guide-relay-diagram"><figcaption>{title}</figcaption><div className="guide-relay-chain">{nodes.map(([name, detail], index) => <div key={name} style={{ display: 'contents' }}>{index > 0 && <ArrowRight size={20} aria-hidden="true" />}<div><strong>{name}</strong><span>{detail}</span></div></div>)}</div></figure>
}

export default function VibeCodingGuidePage() {
  return <div className="forge-explore delegation-guide">
    <a className="explore-skip" href="#guide-main">跳到说明书正文</a>
    <header className="explore-nav"><Link to="/explore" className="explore-brand"><Layers3 size={22} /><span>Forge</span><span className="explore-brand-caption">能力说明书</span></Link><Link to="/explore" className="explore-workspace"><ArrowLeft size={16} />返回能力展厅</Link></header>
    <div className="guide-masthead"><p className="explore-eyebrow">CAPABILITY MANUAL / 02 · VIBE CODING</p><h1>持续推进，每一步都有依据。</h1><p>OpenSpec 定义要完成的工作，Forge Runtime 监督执行进度，Session Grant 限定参与权限。让 Agent 连续工作，也保留所有者的关键决策权。</p><div className="guide-masthead-bottom"><span>自动监督 · 受约束会话委托</span><a href="#supervision">查看技术实现<ArrowRight size={16} /></a></div></div>
    <ExecutionOverview />
    <SessionCapabilityCatalog />
    <AppServerExecutionFlow />
    <details className="execution-details"><summary>展开技术细节：文档、数据库绑定、MCP 与权限校验</summary>
    <div className="guide-layout"><nav className="guide-toc" aria-label="说明书目录"><p>技术细节</p>{sections.map(([id, name], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{name}</a>)}</nav><main>
      <Section id="relationship" title="监督推进工作，授权限定能力。">
        <div className="guide-profiles"><div><h3>自动监督：下一步怎么走？</h3><p>把会话绑定到一个 OpenSpec change。每轮结束后检查任务与阶段，决定继续、修复、暂停或等待用户；浏览器关闭后，仍由运行中的 Forge 服务端监督。</p></div><div><h3>受约束委托：谁能做什么？</h3><p>所有者把固定会话授权给指定参与者。参与者提交需求、回答业务问题、查看公开进度；服务端和 Agent 执行层共同限制命令与工具权限。</p></div></div>
        <p className="guide-note">两者可以组合，也可以独立使用。创建委托不会自动启用监督；启用监督也不会扩大参与者权限。监督运行状态与授权生命周期分别管理。</p>
      </Section>
      <Section id="openspec" title="把需求写成可读取、可执行、可核对的依据。">
        <p className="guide-note">OpenSpec 提供规格、变更和任务的组织方式及 CLI；大模型通过 Skill 与文件读取理解这些文档。Forge 再把任务状态接入运行时监督。可靠性来自明确要求、反复读取、分步执行和结果验证的组合，不能仅凭一份文档保证模型正确执行。</p>
        <div className="guide-table-scroll" tabIndex={0} role="region" aria-label="OpenSpec 文档职责"><table><thead><tr><th>文档</th><th>交代给 Agent 的内容</th><th>执行时如何使用</th></tr></thead><tbody>
          <tr><td><code>proposal.md</code></td><td>为什么做、做什么、不做什么</td><td>确认目标与范围，减少擅自扩展需求</td></tr>
          <tr><td><code>specs/*/spec.md</code></td><td>可观察行为与 WHEN / THEN 场景</td><td>作为实现与验收依据；既有 specs 表达已接受行为，change 内 specs 表达本次变更</td></tr>
          <tr><td><code>design.md</code></td><td>如何实现、关键取舍与验证方案</td><td>结合当前代码定位实现，检查方案与约束</td></tr>
          <tr><td><code>tasks.md</code></td><td>有编号、可勾选的实施与验证步骤</td><td>CLI 输出任务状态，Forge 选择当前未完成项；勾选前应有执行证据</td></tr>
        </tbody></table></div>
        <Chain title="① 文档进入执行：文档文件 → CLI 结构化快照 → 两条消费路径" nodes={[
          ['项目中的 OpenSpec 文件', '需求、设计和任务保存在仓库；修改后可再次读取，跨回合沿用同一份依据。'],
          ['OpenSpec CLI', 'status --change … --json 与 instructions apply --change … --json 提供产物、任务和进度信息。'],
          ['Agent 读内容 / Forge 读状态', 'Agent 按项目 Skill 或兼容 CLI 重读绑定 change；Forge 的 Adapter 解析 task id、description、done 和顺序。'],
        ]} />
        <p className="guide-note">这里没有把所有 Markdown 自动编译成可执行代码。Forge 生成的续跑指令主要携带项目、change、task 和阶段；正文需要 Agent 实际读取。配置 context 与 rules、项目规则和 Skill 指导读取与实施，但仍属于模型需要遵循的指令。</p>
        <Chain title="② 核对执行：当前任务 → 代码与证据 → 重新读取文档状态" nodes={[
          ['只派发当前 task', 'Adapter 选择第一个未完成项，Runtime 绑定其 ID 与序号；Skill 要求每步重读，不凭聊天记忆另选任务。'],
          ['Agent 实现并验证', '读取规格场景与设计，修改代码、运行相关检查、按证据更新任务，再通过 MCP 提交候选进展。'],
          ['Runtime 核对并反馈', '重读 CLI 快照：未完成则继续，全部勾选则进入核验与门禁；失败返回修复，阻塞交还给人。'],
        ]} />
        <dl className="guide-methods">
          <div><dt>文档变化如何被发现</dt><dd>Adapter 对 status 与 apply 的 JSON 输出计算 changeRevision，并记录 task ID 与 applyOrdinal。Runner 检查当前任务序号漂移，异常时暂停。这个修订值反映 CLI 输出，不代表扫描了每个文档的全部内容。</dd></div>
          <div><dt>示例：撤销后不能再发消息</dt><dd>规格写明“授权已撤销时，新发送请求被拒绝”；任务拆成校验实现与撤销后发送测试。Agent 修改服务端并运行测试，记录证据后更新任务。若只勾了任务而没有对应测试，系统仍不能据此证明撤销逻辑正确。</dd></div>
          <div><dt>三种验证各自负责什么</dt><dd>OpenSpec strict validation 检查规格结构与规则；工程测试和 Forge Quality Gate 检查实际执行的用例与检查项；业务验收确认场景在目标环境符合预期。三者不能互相替代。</dd></div>
          <div><dt>当前可靠性的边界</dt><dd>任务勾选和 Agent evidence 都可能不准确；现有监督器不会逐条自动证明代码满足每个自然语言场景。VERIFY 阶段依赖 Agent 的阶段报告，后续工具门禁只覆盖实际配置并执行的检查。关键场景要落实为测试，并核对结果与产物。</dd></div>
        </dl>
        <div className="guide-actions"><a href="#binding">继续看文档任务如何绑定到会话<ArrowRight size={16} /></a></div>
      </Section>
      <Section id="binding" title="绑定是持久化上下文，提示词负责交代任务。">
        <p className="guide-note">当前实现由数据库绑定、内部消息派发、MCP 进度回传和服务端状态机组成。提示词参与执行指导；任务选择与运行状态保存在服务端，聊天文字不会直接改写这些绑定字段。</p>
        <Chain title="① 建立绑定：页面提交 → 服务端解析 → 数据库保存" nodes={[
          ['PUT /sessions/{sessionId}/autopilot', '完整前缀 /api/claude-chat。提交 changeId、goal、projectRoot、autoArchive 和预算；Controller 校验当前用户能否访问会话。'],
          ['start() + ProjectContextResolver', '项目目录规范化后必须等于会话 cwd；读取 Git 身份、分支和工作区指纹，确认 change 存在且未归档，读取下一 task。'],
          ['claude_chat_autopilot_run', '保存 session_id 与 OpenSpecExecutionContext；重新绑定递增 generation，初始 phase=APPLY、version=0。'],
        ]} />
        <dl className="guide-methods">
          <div><dt>绑定到哪里</dt><dd><code>sessionId → projectRoot / repositoryIdentity / branchAtStart / workspaceFingerprint → changeId / changeRevision → currentTaskId / currentTaskOrdinal / phase</code>。另存 agentSessionRef、generation 和 version，用于关联引擎会话与运行版本。</dd></div>
          <div><dt>指纹的具体含义</dt><dd>启动时工作区指纹取 Git 仓库根、分支和 status 输出的 SHA-256；它是身份与状态快照，不是全部文件内容的哈希，也不会锁住分支或目录。</dd></div>
        </dl>
        <Chain title="② 交给 Agent：服务端上下文 → 内部队列 → Skill 与指令" nodes={[
          ['queueContinuation()', '从数据库运行上下文生成 project、change、phase、task 和预算指令；messageId 包含 run、generation、phase、task、turnCount。'],
          ['saveInternal() → 队列释放事件', '续跑内容保存到当前会话内部队列；SessionQueueReleaseRequestedEvent 交给既有执行链派发。'],
          ['Agent 加载并执行', 'ContinuousExecutionSkillProvisioner 部署到 .claude/skills 和 .agents/skills。指令要求只做当前任务，并在让出执行前上报进度。'],
        ]} />
        <Chain title="③ 结果回绑：MCP 报告 → 当前运行 → 回合结束后裁决" nodes={[
          ['report_session_progress', 'Sidecar 校验 disposition、summary、nextAction、remainingWork、evidence、reason；工具参数没有 changeId、taskId 或 projectRoot。'],
          ['绑定会话的 /autopilot/progress', 'MCP 桥使用注入的 sessionId 构造请求；服务端按 sessionId 查当前 ACTIVE 运行，保存候选报告，按 version 乐观锁更新。'],
          ['回合结束 → ContinuousRunner', '重新读取绑定 change 的快照，判断续跑或阶段迁移；步骤表按 run / generation / predecessor 去重。报告 COMPLETE 不直接把整个运行标成完成。'],
        ]} />
        <div className="guide-table-scroll" tabIndex={0} role="region" aria-label="绑定技术约束对照表"><table><thead><tr><th>机制</th><th>代码控制</th><th>实际边界</th></tr></thead><tbody>
          <tr><td>项目与任务绑定</td><td>目录一致性校验、有效 change 查找、持久化任务与阶段</td><td>控制监督器追踪的目标；不自动限制 Agent 每次文件读写</td></tr>
          <tr><td>Skill 与续跑提示词</td><td>自动部署、按服务端字段生成任务指令</td><td>具体实现行为仍依赖模型遵循指令；部署成功不等于引擎已确认加载</td></tr>
          <tr><td>MCP 进度回传</td><td>参数形状校验、桥接会话 ID、ACTIVE 状态与版本检查</td><td>evidence 是报告内容，不是对命令执行真实性的独立证明；桥接绑定不能代替接口访问控制</td></tr>
          <tr><td>状态机与工具门禁</td><td>服务端选 task、检查预算、调用质量门禁与 strict validation；Sidecar 裁决工具权限</td><td>约束流程与工具调用；业务验收和文件级隔离需要各自的验证与实现</td></tr>
        </tbody></table></div>
        <p className="guide-note">例如：会话 S 绑定 change A / task 2.1。Agent 报告 COMPLETE 后，服务端仍读取 A 的 tasks；2.1 未完成时可以继续该任务，不会因为报告文本提到 change B 就改绑到 B。与此同时，当前实现没有按 task 文件清单拦截所有读写，因此不能宣称 Agent 无法修改任务范围之外的文件。</p>
      </Section>
      <Section id="supervision" title="每轮结束，服务端重新判断。">
        <Chain title="① 执行链：规格 → 服务端监督 → Agent" nodes={[
          ['OpenSpec', '提供 change、tasks、规格与修订快照，确定当前任务。'],
          ['Forge Runtime', 'SessionAutopilotService 保存执行上下文；OpenSpecContinuousRunner 决定下一步。'],
          ['Agent / Sidecar', '加载连续执行 Skill，执行当前阶段，报告进展并产生回合结束事件。'],
        ]} />
        <Chain title="② 反馈闭环：回合结果 → 重新核验 → 续跑或交还控制" nodes={[
          ['回合结束与进展报告', 'SessionTurnSettledEvent 与结构化 disposition、summary、evidence 进入服务端。'],
          ['检查状态与证据', '确认安全终态、轮次和时间预算、阻塞报告，再读取最新 OpenSpec 快照。'],
          ['下一步裁决', 'ACTIVE 写入后续队列回到 Agent；PAUSED 暂停；WAITING_USER 等待处理。'],
        ]} />
        <p className="guide-note">执行上下文绑定项目、仓库、分支、change、task、阶段和 generation；运行与步骤记录持久化，步骤去重防止同一回合重复派发。定时协调器参与运行协调，网页只负责展示和控制。</p>
        <dl className="guide-methods"><div><dt>何时交还给人</dt><dd>达到轮次或时间预算、任务上下文漂移、连续核验失败会暂停；Agent 报告阻塞、验证器不可用或归档未授权时等待处理。手动输入会暂停监督并交还控制权。</dd></div><div><dt>三层状态可见</dt><dd>页面分别展示 OpenSpec 绑定、Agent Skill 是否被引擎确认加载、Forge Runtime 是否监督。Skill 已部署不等于引擎已加载。</dd></div></dl>
      </Section>
      <Section id="phases" title="任务勾完，还要经过核验。">
        <ol className="guide-onboarding-steps">{[
          ['APPLY · 实现任务', '读取下一个未完成 task；任务未完成时可续跑同一 task，完成后推进下一项。'],
          ['VERIFY · 实现核验', '要求 Agent 报告当前阶段完成；未通过则返回 APPLY 修复，连续缺少结果会暂停。'],
          ['QUALITY_GATE · 工程门禁', '服务端调用 Forge Quality Gate。失败返回修复，验证器不可用进入等待；只认可实际执行的检查。'],
          ['STRICT_VALIDATE · 规格校验', '执行 OpenSpec strict validation，失败返回修复；持续失败会暂停。'],
          ['ARCHIVE → DONE · 授权收口', '没有自动归档授权时等待用户；确认归档成功后才进入 COMPLETED。'],
        ].map(([name, detail], index) => <li key={name}><span>0{index + 1}</span><div><h3>{name}</h3><p>{detail}</p></div></li>)}</ol>
        <p className="guide-note">完成判定结合任务文件、Agent 阶段报告与工具结果；Agent 自报仍需要证据核对。流程完成不代表业务验收通过，也不代表未执行的测试或目标部署环境已经验证。</p>
      </Section>
      <Section id="constraints" title="权限在服务端和工具调用处落地。">
        <Chain title="参与者请求进入执行环境前，依次通过权限检查" nodes={[
          ['身份与 Session Grant', '登录身份匹配指定参与者和固定会话；校验到期、暂停、撤销以及输入和回合额度。'],
          ['公共协议白名单', '仅允许公开命令；回答问题须匹配当前 requestId，中断须属于自己的活跃回合。'],
          ['Agent 工具策略', '服务端传递执行画像，Sidecar 在工具调用处允许、拒绝或交由所有者审批。'],
        ]} />
        <div className="guide-profiles"><div><code>delegated-request-only</code><h3>仅需求</h3><p>允许提交与澄清需求；除业务问答外拒绝工具调用。</p></div><div><code>delegated-development</code><h3>受约束开发</h3><p>允许白名单工具，其余走审批。普通自动批准和 bypassPermissions 不会直接放行这些委托工具请求。</p></div></div>
        <p className="guide-note">项目、模型、引擎和审批控制保留在所有者端。提示词不能修改服务端画像；公共事件过滤内部管理信息，但消息正文仍需按业务数据要求保护。暂停授权不会自动中断正在执行的回合；工具策略也不等同于操作系统沙箱。</p>
        <div className="guide-actions"><Link to="/explore/delegation">查看委托协议与权限边界<ArrowRight size={16} /></Link><Link to="/explore/delegation#quickstart">SDK / Spring Boot Starter 接入<ArrowRight size={16} /></Link></div>
      </Section>
      <Section id="start" title="从一条已明确范围的 change 开始。">
        <ol className="guide-onboarding-steps">{[
          ['准备项目与规格', '在 Vibe Coding 选择项目和会话，准备活动 OpenSpec change，写清目标、任务和验收依据。'],
          ['启用自动监督', '打开「自动推进」，选择 change、填写监督目标，按需选择「完成后归档」，再点击「启用监督」。'],
          ['按需邀请参与者', '在「委托」指定参与者、画像、有效期和额度。参与者通过参考客户端或 Relay Starter 接入。'],
          ['查看与处理', '在会话状态和「监督看板」查看阶段与原因；需要时审批风险操作、处理阻塞，再恢复监督。'],
        ].map(([name, detail], index) => <li key={name}><span>0{index + 1}</span><div><h3>{name}</h3><p>{detail}</p></div></li>)}</ol>
        <div className="guide-actions"><Link to="/tools/claude-chat">进入 Vibe Coding<ArrowRight size={16} /></Link></div>
        <p className="guide-note">实现线索：f7a8055b 引入基础能力。核心代码为 SessionAutopilotService、OpenSpecContinuousRunner、SessionAccessGrant、SessionClientCommandService 和 Sidecar permissions.ts；本页按当前源码说明，不将说明页验证视为真实 Agent 端到端验收。</p>
      </Section>
    </main></div></details>
  </div>
}

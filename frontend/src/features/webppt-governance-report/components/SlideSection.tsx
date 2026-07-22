import type { ReactNode } from 'react'
import type { Slide } from '../slidesContent'

/** 每页顶部的篇章标签——直接对应 PRD 第 5 节的五大篇章编号，兼顾「一致的视觉锚点」和
 *  「验收标准 2（五大篇章顺序与 PRD 一致）」的可视化自证。封面不需要，留 null。 */
const CHAPTER_TAG: Record<Slide['kind'], string | null> = {
  cover: null,
  'north-star': '北极星 · 研发资产化',
  opening: '篇章一 · 开篇',
  architecture: '篇章二 · 平台能力抽象架构',
  'kg-choice': '篇章二 · 知识治理选型',
  'openspec-decision': '篇章二 · Forge 当前实现',
  principle: '篇章二 · 方法论内核',
  'tool-choice': '篇章二 · 工具选型',
  'platform-capability': '篇章三 · Forge 平台能力',
  'case-study': '篇章三 · 落地案例',
  'closed-loop': '篇章三 · 标准化闭环故事',
  'doc-governance': '篇章三 · 文档治理优势',
  quant: '篇章四 · 治理成果量化数据',
  outlook: '篇章五 · 当前平台能力',
  'outlook-detail': '篇章五 · 未来能力展开',
  adoption: '终章 · 采纳倡议与下一步',
}

function getChapterTag(slide: Slide): string | null {
  if (slide.kind === 'outlook') return '篇章五 · 当前平台能力'
  if (slide.kind === 'outlook-detail') return '篇章五 · 当前平台能力'
  return CHAPTER_TAG[slide.kind]
}

const TOOL_COMPARISON = [
  { label: '定位', superpowers: '完整工程体系', featureDev: '官方标准套餐' },
  { label: '流程重量', superpowers: '重 · 适合长线复杂工程', featureDev: '轻 · 适合中小交付' },
  { label: '核心能力', superpowers: 'TDD / Debug / Skill / Subagent', featureDev: '七阶段 + 3 个内置 Agent' },
  { label: '本次选择', superpowers: '大型项目可组合使用', featureDev: '✓ 本需求真实跑通' },
] as const

const FEATURE_DEV_PHASES = [
  { key: 'discovery', title: '发现需求', term: 'Discovery', detail: '明确问题、约束与目标', gate: '确认理解' },
  { key: 'exploration', title: '探索代码库', term: 'Codebase Exploration', detail: '并行追踪相似实现、架构与关键文件', agent: '2–3 Code Explorer' },
  { key: 'questions', title: '澄清边界', term: 'Clarifying Questions', detail: '补齐异常、兼容、性能与集成细节', gate: '等待回答' },
  { key: 'design', title: '设计方案', term: 'Architecture Design', detail: '比较最小改动、整洁架构与务实方案', agent: '2–3 Code Architect', gate: '选择方案' },
  { key: 'implementation', title: '编码实现', term: 'Implementation', detail: '读取关键文件，按选定架构实施', gate: '批准后开始' },
  { key: 'review', title: '质量复查', term: 'Quality Review', detail: '检查正确性、简洁性与项目规范', agent: '3 Code Reviewer', gate: '决定是否修复' },
  { key: 'summary', title: '完成总结', term: 'Summary', detail: '记录成果、关键决策与下一步' },
] as const

const FORGE_FEATURE_DEV_SUPPORTS = [
  { key: 'knowledge', title: '团队知识注入', detail: '业务知识图谱 + Graphify 代码事实', appliesTo: '强化 Phase 2' },
  { key: 'orientation', title: '编码前定位', detail: '项目档案、影响范围与团队约束', appliesTo: '计划接入 Phase 5' },
  { key: 'guardrail', title: '规范与门禁', detail: 'Skill / Hooks / 违规留痕', appliesTo: '贯穿 Phase 5–6' },
] as const

const SUPERPOWERS_FLOW = [
  { key: 'brainstorm', title: '构思成规格', term: 'Brainstorming', detail: '澄清意图、比较方案，获得设计确认' },
  { key: 'worktree', title: '隔离工作区', term: 'Git Worktree', detail: '新分支独立施工，并验证测试基线' },
  { key: 'plan', title: '拆解实施计划', term: 'Writing Plans', detail: '把设计拆成可验证的小任务' },
  { key: 'build', title: '子代理 + TDD', term: 'Build Loop', detail: '红—绿—重构，逐任务实现与复查' },
  { key: 'review', title: '请求代码审查', term: 'Code Review', detail: '核对规格一致性与代码质量' },
  { key: 'finish', title: '验证并收尾', term: 'Finish Branch', detail: '全量验证后合并、提 PR 或保留分支' },
] as const

const OPENSPEC_FLOW = [
  { key: 'proposal', title: '变更提案', term: 'Proposal', detail: '说明为什么改、要改什么' },
  { key: 'specs', title: '增量规范', term: 'Specs', detail: '记录新增、修改或删除的规则' },
  { key: 'design', title: '技术设计', term: 'Design', detail: '描述关键决策与实现边界' },
  { key: 'tasks', title: '任务清单', term: 'Tasks', detail: '把变更拆成可执行检查项' },
  { key: 'implement', title: '实施变更', term: 'Implement', detail: '按规范和任务推进代码实现' },
  { key: 'archive', title: '合并归档', term: 'Archive', detail: '完成后归档本次需求及规范变化' },
] as const

const FORGE_CURRENT_LOOP = [
  { key: 'clarify', title: '需求明确', term: 'Feature Dev · Clarify', detail: '建立澄清环境，逐轮收敛需求边界', gate: '需求方确认' },
  { key: 'context', title: '双图谱取证', term: 'PDK MCP + Graphify', detail: '查询业务规则与当前代码事实', gate: '上下文有依据' },
  { key: 'prd', title: '规范 PRD', term: 'Structured PRD', detail: '产品、业务、开发共同审核需求原点', gate: '三方审核' },
  { key: 'design', title: '方案设计', term: 'Feature Dev · Design', detail: '形成可实施方案并交由开发审核', gate: '开发确认' },
  { key: 'coding', title: '交互式编码', term: 'Interactive Session', detail: '在对应项目模块中拉起持续开发会话', gate: '实现完成' },
  { key: 'review', title: '复查与总结', term: 'Quality Review + Summary', detail: '检查代码质量，记录结果与关键决策', gate: '一轮代码检查' },
] as const

const FORGE_REVIEW_GUARDS = [
  { key: 'team', name: 'team-standards', role: '团队通用约束', detail: '通用 Skill、质量规则与审查门禁' },
  { key: 'profile', name: 'project-coding-profiles', role: '项目编码画像', detail: '通过 MCP 查询当前项目的专属规范' },
] as const

/** 每页共用的顶部篇章标签 + 大白话类比 + 底部品牌/页码条，保证「无论哪种母版都不是一块光秃秃的空白」。 */
function SlideChrome({
  chapterTag,
  analogy,
  index,
  total,
  children,
}: {
  chapterTag: string | null
  analogy?: string
  index: number
  total: number
  children: ReactNode
}) {
  return (
    <div className="slide-layout">
      <div className="slide-main">
        {chapterTag && <div className="chapter-tag">{chapterTag}</div>}
        {/* 大白话类比放在最前面——先讲人话、再讲专业细节，不要让听众在懂"是什么"之前
            先被 Skill/Hooks/MCP 这些黑话劝退。技术细节仍然在下面，只是从"主角"降级成
            "论据"。 */}
        {analogy && (
          <p className="analogy analogy-lead">
            <span className="analogy-icon" aria-hidden>
              💡
            </span>
            {analogy}
          </p>
        )}
        {children}
      </div>
      <div className="slide-footer">
        <span>FORGE · VibeCoding 平台化治理</span>
        <span>
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

function HarnessNode({ label, term }: { label: string; term: string }) {
  return (
    <div className="harness-node">
      <strong>{label}</strong>
      <small>{term}</small>
    </div>
  )
}

/** 每页仅承载一个论点：一个 <section> 对应一个 Slide，class 标注母版类型供 CSS 命中。 */
export function SlideSection({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const chrome = (children: ReactNode) => (
    <SlideChrome chapterTag={getChapterTag(slide)} analogy={slide.analogy} index={index} total={total}>
      {children}
    </SlideChrome>
  )
  const chromeWithoutAnalogy = (children: ReactNode) => (
    <SlideChrome chapterTag={getChapterTag(slide)} index={index} total={total}>
      {children}
    </SlideChrome>
  )

  switch (slide.kind) {
    case 'cover':
      return (
        <section className="master-cover cover-launch-slide">
          <div className="cover-launch-hero">
            <div className="cover-launch-copy">
              <div className="eyebrow">{slide.eyebrow}</div>
              <h1>{slide.title}</h1>
              <p className="subtitle">{slide.subtitle}</p>
              <p className="cover-launch-thesis">{slide.scatterCaption}</p>
            </div>
            <div className="cover-chaos-scene" aria-hidden>
              <div className="cover-chaos-ring cover-chaos-ring-outer" />
              <div className="cover-chaos-ring cover-chaos-ring-inner" />
              <div className="cover-chaos-core"><span>AI</span><strong>没有统一<br />团队上下文</strong></div>
              {slide.scatterFlow.map((tool, i) => <span className={`cover-chaos-chip cover-chaos-chip-${i + 1}`} key={tool}>{tool}</span>)}
              <i className="cover-chaos-break">⚡</i>
            </div>
          </div>
          <div className="cover-launch-divider"><span>四种失控同时发生</span></div>
          <div className="cover-problems cover-launch-problems">
            {slide.coreProblems.map((problem, problemIndex) => (
              <article className="cover-problem" key={problem.key}>
                <em>0{problemIndex + 1}</em>
                <span className="cover-problem-icon" aria-hidden>{problem.icon}</span>
                <div>
                  <strong>{problem.title}</strong>
                  <p>{problem.summary}</p><small>{problem.consequence}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="cover-launch-close"><span>FORGE</span><strong>把知识、流程与验证重新接成一条团队生产线</strong></div>
        </section>
      )

    case 'opening':
      return (
        <section className="master-content-single opening-slide harness-slide">
          {chrome(
            <>
              <div className="harness-hero">
                <span className="harness-kicker">AGENT HARNESS</span>
                <h2>{slide.heading}</h2>
                <p>{slide.promise}</p>
              </div>
              <div className="harness-architecture">
                <div className="harness-layer harness-goal-layer">
                  <span className="harness-layer-label">01 · 目标层</span>
                  <div className="harness-linear-flow">
                    {slide.goalSteps.map((step) => <HarnessNode key={step.key} label={step.label} term={step.term} />)}
                  </div>
                </div>
                <div className="harness-layer harness-context-layer">
                  <span className="harness-layer-label">02 · 上下文层</span>
                  <div className="harness-linear-flow">
                    {slide.contextSteps.map((step) => <HarnessNode key={step.key} label={step.label} term={step.term} />)}
                  </div>
                </div>
                <div className="harness-layer harness-loop-layer">
                  <span className="harness-layer-label">03 · 执行层</span>
                  <div className="harness-loop-title">Agent Loop <small>每轮观察结果，再决定继续还是重排计划</small></div>
                  <div className="harness-loop-flow">
                    {slide.loopSteps.map((step) => <HarnessNode key={step.key} label={step.label} term={step.term} />)}
                  </div>
                </div>
                <div className="harness-layer harness-quality-layer">
                  <span className="harness-layer-label">04 · 质量层</span>
                  <div className="harness-linear-flow">
                    {slide.qualitySteps.map((step) => <HarnessNode key={step.key} label={step.label} term={step.term} />)}
                  </div>
                </div>
              </div>
              <div className="harness-note">
                <span>关键变化：规划不再只做一次；Agent 根据工具返回的真实结果持续观察、验证和重排。</span>
                <a href={slide.sourceUrl} target="_blank" rel="noreferrer">来源：{slide.sourceLabel}</a>
              </div>
            </>,
          )}
        </section>
      )

    case 'north-star':
      return (
        <section className="master-content-single north-star-slide">
          {chrome(
            <>
              <div className="north-star-hero">
                <span className="north-star-kicker">FORGE NORTH STAR</span>
                <h2>{slide.heading}</h2>
                <p>{slide.promise}</p>
              </div>
              <div className="asset-forge-track">
                {slide.assets.map((asset) => (
                  <article className={`asset-forge-node asset-forge-node-${asset.status}`} key={asset.key}>
                    <span className="asset-forge-icon" aria-hidden>{asset.icon}</span>
                    <strong>{asset.title}</strong>
                    <small>{asset.role}</small>
                    <em>{asset.status === 'live' ? '已具备基础' : '下一阶段'}</em>
                  </article>
                ))}
              </div>
              <div className="north-star-outcomes">
                {slide.outcomes.map((outcome) => (
                  <div key={outcome.key}>
                    <strong>{outcome.value}</strong>
                    <span>{outcome.label}</span>
                  </div>
                ))}
              </div>
            </>,
          )}
        </section>
      )

    case 'architecture':
      return (
        <section className="master-content-single architecture-slide feature-dev-slide">
          {chrome(
            <>
              <div className="feature-dev-hero">
                <span className="feature-dev-kicker">CLAUDE CODE · FEATURE DEV</span>
                <h2>先理解，再设计，最后才动手写代码</h2>
                <p>官方插件用 7 个阶段，把功能开发变成有人确认、有方案选择、有质量复查的完整旅程。</p>
              </div>
              <div className="feature-dev-track">
                {FEATURE_DEV_PHASES.map((phase, phaseIndex) => (
                  <div className="feature-dev-phase" key={phase.key}>
                    <span className="feature-dev-index">0{phaseIndex + 1}</span>
                    <strong>{phase.title}</strong>
                    <small>{phase.term}</small>
                    <p>{phase.detail}</p>
                    {'agent' in phase && phase.agent && <em className="feature-dev-agent">{phase.agent}</em>}
                    {'gate' in phase && phase.gate && <em className="feature-dev-gate">◆ {phase.gate}</em>}
                  </div>
                ))}
              </div>
              <div className="forge-support-rail">
                <span className="forge-support-title">FORGE TEAM LAYER</span>
                {FORGE_FEATURE_DEV_SUPPORTS.map((support) => (
                  <div className="forge-support-item" key={support.key}>
                    <strong>{support.title}</strong>
                    <span>{support.detail}</span>
                    <small>{support.appliesTo}</small>
                  </div>
                ))}
                <a href="https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev" target="_blank" rel="noreferrer">来源：Anthropic 官方 Feature Dev 插件</a>
              </div>
            </>,
          )}
        </section>
      )

    case 'kg-choice':
      return (
        <section className="master-content-single workflow-compare-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="workflow-compare-hero">
                <span className="workflow-compare-kicker">TWO COMPLEMENTARY WORKFLOWS</span>
                <h2>Superpowers 管开发方法，OpenSpec 管变更档案</h2>
                <p>一个约束“怎么高质量开发”，一个记录“这次为什么改、改了什么”——可以组合，不是二选一。</p>
              </div>
              <div className="workflow-rails">
                <div className="workflow-rail workflow-rail-superpowers">
                  <header><span>01</span><div><strong>Superpowers</strong><small>可复用的软件开发方法</small></div></header>
                  <div className="workflow-node-track">
                    {SUPERPOWERS_FLOW.map((step, stepIndex) => (
                      <article className="workflow-node" key={step.key}>
                        <span className="workflow-node-index">{String(stepIndex + 1).padStart(2, '0')}</span>
                        <strong>{step.title}</strong><small>{step.term}</small><p>{step.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="workflow-rail workflow-rail-openspec">
                  <header><span>02</span><div><strong>OpenSpec</strong><small>可追踪的需求变更档案</small></div></header>
                  <div className="workflow-node-track">
                    {OPENSPEC_FLOW.map((step, stepIndex) => (
                      <article className="workflow-node" key={step.key}>
                        <span className="workflow-node-index">{String(stepIndex + 1).padStart(2, '0')}</span>
                        <strong>{step.title}</strong><small>{step.term}</small><p>{step.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
              <div className="workflow-compare-note">
                <strong>一句话区分</strong><span>Superpowers 复用的是“开发方法”；OpenSpec 归档的是“本次需求及其规范变化”。</span>
                <div><a href="https://github.com/obra/superpowers" target="_blank" rel="noreferrer">Superpowers 官方流程</a><a href="https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md" target="_blank" rel="noreferrer">OpenSpec 官方流程</a></div>
              </div>
            </>,
          )}
        </section>
      )

    case 'openspec-decision':
      return (
        <section className="master-content-single forge-current-loop-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="forge-loop-hero">
                <span className="forge-loop-kicker">FORGE · CURRENT IMPLEMENTATION</span>
                <h2>从需求澄清，到完成一轮代码检查</h2>
                <p>Feature Dev 负责主流程，Forge 把业务知识、代码事实和团队规范接入每个关键决策点。</p>
              </div>
              <div className="forge-loop-track">
                {FORGE_CURRENT_LOOP.map((step, stepIndex) => (
                  <article className={`forge-loop-step forge-loop-step-${step.key}`} key={step.key}>
                    <span className="forge-loop-index">{String(stepIndex + 1).padStart(2, '0')}</span>
                    <strong>{step.title}</strong><small>{step.term}</small><p>{step.detail}</p><em>◆ {step.gate}</em>
                  </article>
                ))}
              </div>
              <div className="forge-context-review-grid">
                <div className="forge-context-injection">
                  <span className="forge-band-label">澄清依据</span>
                  <div><strong>PDK 业务知识图谱</strong><small>业务规则、状态与跨系统关系</small></div>
                  <b>+</b>
                  <div><strong>Graphify 代码知识图谱</strong><small>调用链、依赖与当前实现</small></div>
                  <p>共同生成更有依据的引导问题</p>
                </div>
                <div className="forge-review-guards">
                  <span className="forge-band-label">复查门禁</span>
                  {FORGE_REVIEW_GUARDS.map((guard) => (
                    <div key={guard.key}><strong>{guard.name}</strong><span>{guard.role}</span><small>{guard.detail}</small></div>
                  ))}
                </div>
              </div>
              <div className="forge-loop-boundary"><strong>当前边界</strong><span>这是“一轮代码检查”：质量复查与完成总结依赖 Feature Dev；最终业务验收仍由产品、业务、开发对照 PRD 完成。</span></div>
            </>,
          )}
        </section>
      )

    case 'principle':
      return (
        <section className="master-content-single principle-slide">
          {chrome(
            <>
              <h2>{slide.heading}</h2>
              <div className="method-flow-board">
                {slide.flows.map((flow) => (
                  <article className={`method-lane method-lane-${flow.key}`} key={flow.key}>
                    <header>
                      <div><strong>{flow.name}</strong><span>{flow.metaphor}</span></div>
                      <p>{flow.principle}</p>
                    </header>
                    <div className="method-steps">
                      {flow.steps.map((step, stepIndex) => (
                        <div className="method-step" key={step}>
                          <span>{String(stepIndex + 1).padStart(2, '0')}</span>
                          <strong>{step}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                <div className="method-boundaries">
                  {slide.boundaryNotes.map((note) => (
                    <div key={note.key}><strong>{note.label}</strong><p>{note.detail}</p></div>
                  ))}
                </div>
                <div className="method-convergence"><span>汇合</span><strong>{slide.convergence}</strong></div>
              </div>
              <p className="caption method-note">{slide.note}</p>
            </>,
          )}
        </section>
      )

    case 'tool-choice':
      return (
        <section className="master-content-single tool-choice-slide tool-choice-launch-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="tool-choice-hero">
                <span className="tool-choice-kicker">WORKFLOW DECISION</span>
                <h2>为什么当前主流程选择 Feature Dev？</h2>
                <p>不是能力高低，而是按本次交付体量选择更合适的工程方法。</p>
              </div>
              <div className="tool-showdown">
                <header className="tool-contender tool-contender-superpowers">
                  <span>SP</span><div><strong>Superpowers</strong><small>像 Spring 全家桶 / Spring Ecosystem</small><em>优势：能力完整、组合自由</em><p>代价：体系较重，学习与执行成本更高</p></div>
                </header>
                <div className="tool-showdown-axis">对比维度</div>
                <header className="tool-contender tool-contender-feature-dev">
                  <span>FD</span><div><strong>Feature Dev</strong><small>像 Spring Boot Starter + Initializr</small><em>优势：约定优于配置、上手快</em><p>代价：复杂工程需要外接增强能力</p></div>
                </header>
                {TOOL_COMPARISON.map((row) => (
                  <div className="tool-showdown-row" key={row.label}>
                    <div>{row.superpowers}</div><strong>{row.label}</strong><div>{row.featureDev}</div>
                  </div>
                ))}
              </div>
              <div className="tool-gap-band">
                <strong>Feature Dev 未内建的强制环节</strong>
                <span>TDD 红—绿—重构</span><span>系统化调试</span><span>Git Worktree 隔离</span><span>逐任务双重审查</span><span>分支收尾</span>
                <em>可由 Forge 治理层补齐</em>
              </div>
              <div className="tool-choice-verdict">
                <span>当前选择</span><strong>Feature Dev 主跑</strong><b>七阶段清晰、官方维护、适合当前中小交付</b><i>复杂长线工程仍可组合 Superpowers</i>
              </div>
            </>,
          )}
        </section>
      )

    case 'platform-capability':
      return (
        <section className={`master-content-dual platform-capability platform-capability-${slide.variant}`}>
          {chrome(
            <>
              <h2>{slide.heading}</h2>
              <div className="platform-capability-layout">
                <figure className="platform-capability-visual">
                  <img src={slide.imageSrc} alt={slide.imageAlt} />
                  <figcaption>{slide.metaphor}</figcaption>
                </figure>
                <div className="platform-capability-story">
                  <p className="platform-capability-claim">{slide.claim}</p>
                  <div className="platform-capability-actions">
                    {slide.actions.map((action, index) => (
                      <article className="platform-capability-action" key={action.key}>
                        <span>{index + 1}</span>
                        <div><strong>{action.label}</strong><p>{action.detail}</p></div>
                      </article>
                    ))}
                  </div>
                  <p className="platform-capability-outcome">{slide.outcome}</p>
                </div>
              </div>
            </>,
          )}
        </section>
      )

    case 'case-study':
      return (
        <section className="master-content-single case-study-slide engine-orchestration-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="engine-hero">
                <span className="engine-kicker">ENGINE ORCHESTRATION</span>
                <h2>{slide.heading}</h2>
                <p>引擎负责执行，Forge 负责把项目、上下文、会话状态和操作入口统一起来。</p>
              </div>
              <div className="engine-flow">
                <article className="engine-flow-node engine-project-node"><span>01</span><i>PROJECT</i><strong>选择项目模块</strong><small>自动绑定工作目录</small></article>
                <b className="engine-flow-arrow">→</b>
                <article className="engine-flow-node engine-session-node"><span>02</span><i>FORGE SESSION</i><strong>统一会话编排</strong><small>任务 · 上下文 · 生命周期</small></article>
                <b className="engine-flow-arrow">→</b>
                <article className="engine-flow-node engine-router-node"><span>03</span><i>ENGINE ROUTER</i><strong>路由执行引擎</strong><small>启动 · 停止 · 续跑 · 切换</small></article>
                <b className="engine-flow-arrow">→</b>
                <article className="engine-flow-node engine-output-node"><span>04</span><i>STREAM</i><strong>实时回传结果</strong><small>输出与状态回到同一界面</small></article>
              </div>
              <div className="engine-pool"><span>CLAUDE CODE</span><span>CODEX</span><span>GEMINI</span><span>OPENCODE</span></div>
              <div className="engine-runtime-band">
                <div><strong>会话不随引擎消失</strong><p>标题、项目归属和历史沿革保持一致</p></div>
                <div><strong>执行句柄彼此隔离</strong><p>不同引擎的上下文与续跑状态不互相覆盖</p></div>
                <div><strong>中断不是报废</strong><p>{slide.lifecycle.highlight}</p></div>
              </div>
              <div className="engine-verdict"><span>平台价值</span><strong>不用分别打开和管理四套工具</strong><p>在 Forge 中选择项目、发起任务、观察执行、随时续跑。</p></div>
            </>,
          )}
        </section>
      )

    case 'closed-loop':
      return (
        <section className="master-content-single closed-loop-slide">
          {chrome(
            <>
              <h2>{slide.heading}</h2>
              <div className="loop-track">
                {slide.stages.map((s, i) => (
                  <div className={`loop-stage loop-stage-${s.status}`} key={s.key}>
                    <div className="loop-stage-head"><span>{i + 1}</span><div className="layer-label">
                        {s.label}
                        {s.status === 'not-called' ? '（未显式调用）' : ''}
                      </div></div>
                    <div className="layer-detail">{s.detail}</div>
                  </div>
                ))}
              </div>
              <p className="provenance-note">{slide.dataSourceDisclaimer}</p>
            </>,
          )}
        </section>
      )

    case 'doc-governance':
      return (
        <section className="master-content-single doc-governance-slide doc-memory-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="doc-memory-hero">
                <span>DEVELOPMENT MEMORY LOOP</span>
                <h2>{slide.heading}</h2>
                <p>不是把文件放进仓库，而是让需求、方案、会话和代码始终指向同一条事实链。</p>
              </div>
              <div className="doc-memory-loop">
                {slide.trail.map((step, index) => (
                  <article className={`doc-memory-node doc-memory-node-${step.key}`} key={step.key}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                    {index < slide.trail.length - 1 && <b>→</b>}
                  </article>
                ))}
                <div className="doc-memory-return"><span>↩</span><strong>自动落地记忆</strong><small>归档后的最新版本，成为下一次工作的起点</small></div>
              </div>
              <div className="doc-intelligence-layer">
                <header><span>AI GOVERNANCE</span><strong>当文档与会话形成连续记录，平台才能进一步计算</strong></header>
                <div className="doc-intelligence-items">
                  {slide.versionStat.map((item, index) => (
                    <article key={item.value}><span>0{index + 1}</span><strong>{item.value}</strong><p>{item.label}</p></article>
                  ))}
                </div>
              </div>
              <div className="doc-memory-verdict">
                <span>研发资产</span><strong>{slide.toolEvidence}</strong>
                <div><i>可追溯</i><i>可验证</i><i>可回归</i><i>可归档</i></div>
              </div>
            </>,
          )}
        </section>
      )

    case 'quant':
      return (
        <section className="master-content-single quant-slide quant-launch-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="quant-hero"><span>MEASURABLE GOVERNANCE</span><h2>把“需求是否讲清楚”变成可检查的数据</h2><p>数字不是战绩，而是一次需求从模糊走向可执行所留下的结构证据。</p></div>
              <div className="quant-stage">
                {slide.stats.map((stat, index) => (
                  <article key={stat.label}><span>0{index + 1}</span><strong>{stat.value}<small>{stat.unit}</small></strong><p>{stat.label}</p></article>
                ))}
              </div>
              <div className="quant-insight-line">{slide.insights.slice(0, 3).map((insight, index) => <div key={insight}><span>0{index + 1}</span><p>{insight}</p></div>)}</div>
              <div className="quant-verdict"><span>结论</span><strong>澄清过程可量化，遗漏和风险才能在编码前被看见。</strong></div>
            </>,
          )}
        </section>
      )

    case 'adoption':
      return (
        <section className="master-summary adoption-launch-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="adoption-hero"><span>FORGE · NEXT MOVE</span><h2>把个人会用 AI，升级为团队会交付</h2><p>工具已经具备，下一步是把统一入口、知识上下文和质量门禁接成默认工作方式。</p></div>
              <div className="adoption-path">
                {slide.onboardingSteps.map((step, index) => <article key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < slide.onboardingSteps.length - 1 && <b>→</b>}</article>)}
              </div>
              <div className="adoption-value-core"><span>最终结果</span>{slide.valueProps.map((value) => <strong key={value}>{value}</strong>)}</div>
              <div className="adoption-decision"><span>优先动作</span><strong>显式接通 Feature Dev → 编码前定位 Skill</strong><p>再逐步建设可观测、可复盘的长期治理看板。</p></div>
            </>,
          )}
        </section>
      )

    case 'outlook':
      return (
        <section className="master-content-single outlook-slide outlook-launch-slide">
          {chromeWithoutAnalogy(
            <>
              <div className="outlook-launch-hero"><span>FROM PLATFORM TO OPERATING SYSTEM</span><h2>{slide.heading}</h2><p>{slide.thesis}</p></div>
              <div className="outlook-system-map">
                <div className="outlook-foundation-ring">
                  {slide.foundations.map((item, index) => <article key={item.key}><span>{item.icon}</span><div><small>FOUNDATION 0{index + 1}</small><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}
                </div>
                <div className="outlook-ai-orb"><i /><i /><span>FORGE</span><strong>TEAM<br />AI OS</strong></div>
                <div className="outlook-future-ray">
                  {slide.futures.map((item) => <article key={item.key}><span>{item.index}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}
                </div>
              </div>
              <div className="outlook-launch-verdict"><span>目标</span><strong>{slide.outcome}</strong></div>
            </>,
          )}
        </section>
      )

    case 'outlook-detail':
      return (
        <section className={`master-content-single outlook-detail-slide outlook-detail-${slide.statusTone} outlook-detail-${slide.id}`}>
          {chromeWithoutAnalogy(
            <>
              <div className="outlook-detail-heading">
                <span className="outlook-status">{slide.status}</span>
                <h2>{slide.heading}</h2>
              </div>
              <p className="outlook-promise">{slide.promise}</p>
              <div className="outlook-story-stage">
                <div className="outlook-story-before">
                  <small>以前</small>
                  <strong>{slide.currentPain}</strong>
                </div>
                <div className="outlook-core" aria-label="Forge AI Core">
                  <i /><i /><i />
                  <span>{slide.icon}</span>
                  <b>FORGE<br />AI CORE</b>
                </div>
                <div className="outlook-story-after">
                  <small>现在 / 未来</small>
                  <strong>{slide.closing}</strong>
                </div>
              </div>
              <div className="outlook-journey">
                <div className="outlook-journey-line" />
                {slide.actions.map((action) => (
                  <div key={action.key}><span /><strong>{action.title}</strong><small>{action.detail}</small></div>
                ))}
              </div>
              <div className="outlook-benefit-words">
                {slide.benefits.map((benefit, index) => <span key={benefit}><em>0{index + 1}</em>{benefit}</span>)}
              </div>
            </>,
          )}
        </section>
      )
  }
}

/**
 * 五大篇章的内容数据——与展示组件（WebpptDeck）解耦，改文案不用碰交互代码。
 * 内容出处：本需求 PRD（~/.kai-toolbox/prd/ee732035-edcd-4fa3-bbef-daabc44ab320.md）
 * §2/§5/§9，以及 generatedQuantData.json（由 scripts/generate-webppt-quant-data.mjs
 * 分析同一需求的 PRD/开发文档版本文件产出，见该脚本头部注释）。
 */
import type { MasterType } from './WebpptDesignTokens'
import generatedQuantData from './generatedQuantData.json'

export interface SlideBase {
  id: string
  /** master 只负责 CSS 母版外观；kind 是内容形状的判别字段（同一 master 下可有多种 kind）。 */
  master: MasterType
  /**
   * 「大白话」一句话类比——PRD 非功能性需求要求兼顾非技术听众（§6"内容准确性"、
   * 风险 R6"分层信息密度"）：主线文案给技术听众，这里给非技术听众一个不用理解
   * 术语也能懂的画面。全篇统一用「装修」作类比线索，减少听众来回切换心智模型的成本。
   * 封面不需要（标题本身已经是一句话钩子）。
   */
  analogy?: string
}

export interface CoverSlide extends SlideBase {
  kind: 'cover'
  master: 'cover'
  eyebrow: string
  title: string
  subtitle: string
  /** 封面visual：一串各自为战的工具/渠道名，中间打断，直观呈现"流程断裂"，
   * 不用等到后面几页才让人感受到问题——领导一眼就能看懂"乱"具体乱在哪。 */
  scatterFlow: string[]
  scatterCaption: string
  coreProblems: { key: string; icon: string; title: string; summary: string; consequence: string }[]
}

export interface OpeningSlide extends SlideBase {
  kind: 'opening'
  master: 'content-single'
  heading: string
  promise: string
  goalSteps: { key: string; label: string; term: string }[]
  contextSteps: { key: string; label: string; term: string }[]
  loopSteps: { key: string; label: string; term: string }[]
  qualitySteps: { key: string; label: string; term: string }[]
  sourceLabel: string
  sourceUrl: string
}

export interface NorthStarSlide extends SlideBase {
  kind: 'north-star'
  master: 'content-single'
  heading: string
  promise: string
  assets: { key: string; icon: string; title: string; role: string; status: 'live' | 'next' }[]
  outcomes: { key: string; value: string; label: string }[]
}

export interface ArchitectureLayer {
  key: string
  /** 大白话岗位名——先给非技术听众一个"这是干嘛的"直觉，英文黑话挪到 label 里去。 */
  icon: string
  role: string
  label: string
  detail: string
  solves: string
}

export interface ArchitectureSlide extends SlideBase {
  kind: 'architecture'
  master: 'content-single'
  heading: string
  intro: string
  layers: ArchitectureLayer[]
}

export interface KgChoicePoint {
  key: string
  label: string
}

/** 独立成页：架构页里"知识图谱层"只有一句话，这里说清楚"业务真理/变更意图/代码事实/
 * 人的阅读"这四种知识治理定位分别是谁在管、为什么代码事实层这次点名用 Graphify——
 * 避免让人以为一个知识图谱工具能包打天下、或者把 Graphify 和 PDK 的分工搞混。 */
export interface KgChoiceSlide extends SlideBase {
  kind: 'kg-choice'
  master: 'content-dual'
  heading: string
  positions: KgChoicePoint[]
  ourChoice: string
  sourceNote: string
}

export interface ResponsibilityMapping {
  key: string
  label: string
}

/** 独立成页：上一页的 4 选型里 OpenSpec 只占一句话，这里把"要不要为 OpenSpec 单独
 * 保留一条平行入口"这个具体判断说清楚——feature-dev 产出要接住 OpenSpec 的哪些
 * 职责、结论是什么、以及这个判断本身是可逆的（后续仍可选择调用 OpenSpec 生成
 * 文档），避免听众误以为是"排除 OpenSpec"的一次性决定。 */
export interface OpenspecDecisionSlide extends SlideBase {
  kind: 'openspec-decision'
  master: 'content-dual'
  heading: string
  responsibilityMappings: ResponsibilityMapping[]
  decision: string
  caveat: string
}

/** 独立成页，而不是塞在架构图下面当一行小字——openspec/superpower 这两个方法论引用
 * 是「为什么这么设计」的关键论证，值得有自己的视觉份量（也顺带把架构页的内容量
 * 拆薄，5 层卡片 + 一行原则说明挤在同一个 1280x720 画布里会溢出，reveal.js 的
 * width/height 是固定虚拟画布整体缩放，不会给超出的内容自动换行/缩小字号）。 */
export interface PrincipleSlide extends SlideBase {
  kind: 'principle'
  master: 'content-single'
  heading: string
  flows: {
    key: string
    name: string
    metaphor: string
    principle: string
    steps: string[]
  }[]
  boundaryNotes: { key: string; label: string; detail: string }[]
  convergence: string
  note: string
}

export interface ToolChoicePoint {
  key: string
  label: string
}

/** 独立成页：上一页讲的是「openspec/superpower 这套思想」，这一页讲「这次具体选了
 * 哪个落地工具」——Claude Code 生态里 Superpowers（社区插件）和 Feature Dev
 * （Anthropic 官方插件）是这套思想目前两个真实存在、可安装使用的实现，说清楚
 * 选型依据，比只讲抽象思想更有说服力（且本需求自身的 PRD/开发文档/这份 PPT，
 * 就是用 feature-dev 跑出来的，是可验证的自举证据）。 */
export interface ToolChoiceSlide extends SlideBase {
  kind: 'tool-choice'
  master: 'content-dual'
  heading: string
  comparisonPoints: ToolChoicePoint[]
  ourChoice: string
  sourceNote: string
}

export interface PlatformCapabilitySlide extends SlideBase {
  kind: 'platform-capability'
  master: 'content-dual'
  heading: string
  variant: 'workspace' | 'runtime' | 'assets'
  imageSrc: string
  imageAlt: string
  metaphor: string
  claim: string
  actions: { key: string; label: string; detail: string }[]
  outcome: string
}

export interface CaseStudySlide extends SlideBase {
  kind: 'case-study'
  master: 'content-dual'
  heading: string
  multiEngine: { title: string; points: string[] }
  lifecycle: { title: string; states: string[]; highlight: string }
  provenanceNote: string
}

export interface ClosedLoopStage {
  key: string
  label: string
  status: 'done' | 'conditional' | 'not-called'
  detail: string
}

export interface ClosedLoopSlide extends SlideBase {
  kind: 'closed-loop'
  master: 'content-single'
  heading: string
  stages: ClosedLoopStage[]
  dataSourceDisclaimer: string
}

export interface DocTrailItem {
  key: string
  label: string
  detail: string
}

/** 独立成页，回应"文档管理是不是本次汇报专属演示"这个疑问——用『PRD 澄清助手』
 * 这个 Forge 里已经真实上线、团队日常在用的工具本身举证，而不是只讲本需求这一次。 */
export interface DocGovernanceSlide extends SlideBase {
  kind: 'doc-governance'
  master: 'content-dual'
  heading: string
  trail: DocTrailItem[]
  toolEvidence: string
  versionStat: { label: string; value: string }[]
}

export interface QuantStat {
  label: string
  value: number
  unit: string
}

export interface QuantSlide extends SlideBase {
  kind: 'quant'
  master: 'content-dual'
  heading: string
  stats: QuantStat[]
  insights: string[]
  disclaimer: string
}

export interface AdoptionSlide extends SlideBase {
  kind: 'adoption'
  master: 'summary'
  heading: string
  onboardingSteps: string[]
  valueProps: string[]
  roadmapTeaser: string
}

export interface OutlookSlide extends SlideBase {
  kind: 'outlook'
  master: 'content-dual'
  heading: string
  thesis: string
  foundations: { key: string; icon: string; title: string; detail: string }[]
  futures: { key: string; index: string; title: string; detail: string }[]
  outcome: string
}

export interface OutlookDetailSlide extends SlideBase {
  kind: 'outlook-detail'
  master: 'content-dual'
  status: string
  statusTone: 'live' | 'building' | 'future'
  icon: string
  heading: string
  promise: string
  currentPain: string
  actions: { key: string; title: string; detail: string }[]
  benefits: string[]
  closing: string
}

export type Slide =
  | CoverSlide
  | NorthStarSlide
  | OpeningSlide
  | ArchitectureSlide
  | KgChoiceSlide
  | OpenspecDecisionSlide
  | PrincipleSlide
  | ToolChoiceSlide
  | PlatformCapabilitySlide
  | CaseStudySlide
  | ClosedLoopSlide
  | DocGovernanceSlide
  | QuantSlide
  | OutlookSlide
  | OutlookDetailSlide
  | AdoptionSlide

const coverSlide: CoverSlide = {
  id: 'cover',
  kind: 'cover',
  master: 'cover',
  eyebrow: 'FORGE · 展示',
  title: '为什么 AI Coding 团队，反而越来越乱？',
  subtitle: '我们不缺 AI，缺的是——统一知识、标准流程与验证闭环。',
  scatterFlow: ['PRD', '微信群', 'AI 对话', 'Jira', 'Git', 'Excel / 文档库'],
  scatterCaption: '工具只是表象；真正失控的是知识、上下文、过程和质量没有统一标准。',
  coreProblems: [
    {
      key: 'knowledge',
      icon: '🧠',
      title: '知识与上下文不统一',
      summary: '专家知道一部分，AI 只看到一小段',
      consequence: '业务知识分散、上下文不足、个人理解和 AI 理解都有边界',
    },
    {
      key: 'process',
      icon: '💬',
      title: '各自使用 Chatbox 模式',
      summary: '各问各的、各做各的、没有统一计划',
      consequence: '提示方式不同、步骤随意、信息传递偏差不断放大',
    },
    {
      key: 'documents',
      icon: '📄',
      title: '输入文档没有标准',
      summary: 'PRD、开发文档大纲和深度各不相同',
      consequence: '与标准套件流程脱节，范围、方案和验收条件容易遗漏',
    },
    {
      key: 'verification',
      icon: '🔍',
      title: '输出缺少检测与验证',
      summary: 'AI 给出答案就直接使用',
      consequence: '幻觉没有核实、影响范围没检查、完成后也缺少质量审查',
    },
  ],
}

const northStarSlide: NorthStarSlide = {
  id: 'north-star',
  kind: 'north-star',
  master: 'content-single',
  heading: '让每一次开发，都成为下一次的起点',
  promise: 'Forge 把需求、方案与代码炼成持续生长的团队资产',
  assets: [
    { key: 'prd', icon: '◆', title: 'PRD', role: '需求原点', status: 'live' },
    { key: 'design', icon: '◇', title: '开发文档', role: '实施事实', status: 'live' },
    { key: 'code', icon: '⌘', title: '代码', role: '业务资产', status: 'live' },
    { key: 'governance', icon: '✦', title: 'AI 自动治理', role: '价值 · 工时 · 进度 · 影响', status: 'next' },
  ],
  outcomes: [
    { key: 'progress', value: '进度可信', label: 'PRD、文档与代码共同核查' },
    { key: 'knowledge', value: '知识复用', label: '减少业务与代码上下文重复梳理' },
    { key: 'focus', value: '回归业务', label: '把开发注意力还给价值与验收' },
  ],
}

const openingSlide: OpeningSlide = {
  id: 'opening',
  kind: 'opening',
  master: 'content-single',
  heading: '主流 Agent 架构，正在收敛为同一套执行闭环',
  promise: '综合 Microsoft Agent Framework、Claude Code、OpenHands 与 Codex 的共同模式',
  goalSteps: [
    { key: 'user', label: '用户提出目标', term: 'User' },
    { key: 'intent', label: '理解真实意图', term: 'Intent Understanding' },
    { key: 'goal-plan', label: '形成高层目标', term: 'High-Level Goal Planning' },
  ],
  contextSteps: [
    { key: 'discovery', label: '发现所需上下文', term: 'Context Discovery · Graph / Index / Spec / RAG' },
    { key: 'assembly', label: '组装可执行上下文', term: 'Context Assembly' },
    { key: 'task-plan', label: '生成详细任务计划', term: 'Detailed Task Planning' },
  ],
  loopSteps: [
    { key: 'reason', label: '推理', term: 'Reason' },
    { key: 'decide', label: '决定工具', term: 'Decide Tool' },
    { key: 'execute', label: '执行工具', term: 'Execute Tool' },
    { key: 'observe', label: '观察结果', term: 'Observe' },
    { key: 'replan', label: '必要时重排计划', term: 'Replan' },
  ],
  qualitySteps: [
    { key: 'verify', label: '验证、测试与审查', term: 'Verify / Test / Review' },
    { key: 'complete', label: '确认完成', term: 'Complete' },
  ],
  sourceLabel: 'Microsoft Agent Framework · Build your own claw and agent harness',
  sourceUrl: 'https://devblogs.microsoft.com/agent-framework/build-your-own-claw-and-agent-harness-with-microsoft-agent-framework/',
}

const architectureSlide: ArchitectureSlide = {
  id: 'architecture',
  kind: 'architecture',
  master: 'content-single',
  heading: '真实开发流水线：Feature Dev 主跑，Forge 提供知识与治理',
  intro: '',
  layers: [
    {
      key: 'feature-dev',
      icon: '🚂',
      role: '负责施工的主班组',
      label: 'Feature Dev（官方插件）',
      detail: '需求澄清 → 代码探索 → 方案设计 → 编码实现 → Quality Review',
      solves: '当前真实主流程；Phase 6 做代码质量审查，业务验收仍按 PRD 验收标准执行',
    },
    {
      key: 'hooks',
      icon: '🛂',
      role: '团队自己的门禁',
      label: 'Forge Skill / Hooks',
      detail: '编码前定位、团队规范和违规留痕；不由 Feature Dev 自动加载',
      solves: '需要显式接线；design-doc-required 不在当前 PRD 开发主链中',
    },
    {
      key: 'business-knowledge',
      icon: '📚',
      role: '公司的业务规则库',
      label: '业务知识图谱',
      detail: 'domain-knowledge / cross-topology：业务规则、状态机和跨系统关系',
      solves: '回答“业务为什么这样做”，避免只看代码猜业务',
    },
    {
      key: 'project-graphify',
      icon: '🗺️',
      role: '每个项目的代码地图',
      label: 'Graphify 项目知识图谱',
      detail: '各项目基于自身代码生成：模块结构、调用链、依赖与既有实现',
      solves: '回答“代码现在怎么实现、改这里会影响哪里”',
    },
    {
      key: 'plugin',
      icon: '🧰',
      role: '标准工具箱',
      label: 'Plugin 层',
      detail: '以上能力打包为可安装、可复用的 Claude Code 插件（team-standards 等）',
      solves: '能力可复制，团队可复用，而非个人经验',
    },
  ],
}

const kgChoiceSlide: KgChoiceSlide = {
  id: 'kg-choice',
  kind: 'kg-choice',
  master: 'content-dual',
  heading: '当前主流程：Feature Dev 负责开发，Forge 负责补足团队治理',
  positions: [
    { key: 'pdk', label: 'project-domain-knowledge（PDK）：回答"业务真理是什么"——人工确认、代码验证、权威文档，AI 与团队共同消费' },
    { key: 'openspec', label: 'feature-dev:feature-dev：当前负责需求澄清、代码探索、技术方案、实现和审查；OpenSpec 仅保留为可插拔的变更文档格式' },
    { key: 'graphify', label: 'Graphify：回答"代码当前怎么实现"——基于 AST/代码/文档提取调用链、依赖、影响范围' },
    { key: 'obsidian', label: 'Obsidian：回答"人怎么阅读和整理知识"——面向人的浏览/双链/看板工作台，不是新知识源，不替代前三者' },
  ],
  ourChoice:
    'Feature Dev 是当前需求开发主流程，但它不会自动加载团队自定义 Skill。Forge 仍需在 Phase 5 前显式追加 pre-implementation-code-orientation，才能稳定完成项目文档定位、知识图谱查询和受影响代码确认；当前这段自动接线尚未完成。',
  sourceNote: '当前接线依据 Forge 的 PRD 开发入口：seed 消息会调用 /feature-dev:feature-dev，但尚未包含 pre-implementation-code-orientation 的显式调用。',
  analogy: '大白话：Feature Dev 是负责本次施工的班组；Forge 还要在开工前递上项目档案、现场线路图和团队验收标准，否则班组并不知道这些内部资料放在哪里。',
}

const openspecDecisionSlide: OpenspecDecisionSlide = {
  id: 'openspec-decision',
  kind: 'openspec-decision',
  master: 'content-dual',
  heading: 'OpenSpec 替代声明：用 feature-dev 产出接住变更闭环',
  responsibilityMappings: [
    { key: 'intent-diff', label: '需求意图 + 现状/目标差异 → PRD 里的背景、目标、范围、非目标，补一句"当前行为 vs 目标行为"' },
    { key: 'design-acceptance', label: '开发设计 + 验收契约 → 技术方案文档里的接口/数据库/状态/流程/影响范围，加可验证的验收条件' },
    { key: 'trace-decision', label: '变更追踪 + 决策记录 → 同一个需求会话（PRD_SESSION_ID）串起来，技术方案文档留痕方案取舍' },
    { key: 'archive-knowledge', label: '完成归档 + 知识沉淀 → 实现结果记入开发文档更新记录；只有长期有效的业务规则才沉淀进 PDK，代码关系交给 Graphify 重建' },
  ],
  decision:
    '本次判断：feature-dev 产出的 PRD + 技术方案文档，补齐上面四类职责后，可以替代 OpenSpec 的"变更闭环"角色——不是把 OpenSpec 排除在外，后续如果需要，仍可以选择调用 OpenSpec 生成文档，生成方式本身可插拔、可替换，不影响这套治理骨架。',
  caveat:
    '需要避免的问题：不要把每次 PRD/开发文档都当永久档案堆进 PDK——只有最终确认、以后仍然有效的业务规则、字段含义、状态转换和流程才应该沉淀进去，PDK 不是需求档案堆积区。本页职责映射基于团队内部工具选型讨论，是否完全移除 OpenSpec 取决于 feature-dev 实际产出能否覆盖上述职责，属于阶段性判断。',
  analogy:
    '大白话：不是再雇一个"变更单专员"——装修工作日志本身就把图纸、验收条件、变更取舍都记了，这道手续不用重复走一遍；哪天真想要更正式的变更单格式，随时可以再请这位专员，不冲突。',
}

const toolChoiceSlide: ToolChoiceSlide = {
  id: 'tool-choice',
  kind: 'tool-choice',
  master: 'content-dual',
  heading: '工具选型：为什么是 Feature Dev，而不是 Superpowers',
  comparisonPoints: [
    { key: 'overlap', label: '需求澄清、项目探索、架构设计、Code Review——两者都覆盖，起点相近' },
    { key: 'superpowers', label: 'Superpowers（社区插件）更"重"更全：完整 TDD 流程、四阶段 Debug 方法论、可教 Claude 写新 Skill、成熟的 Subagent 体系，适合长线复杂工程' },
    { key: 'feature-dev', label: 'Feature Dev（Anthropic 官方插件）是这套流程的"精选轻量版"：七阶段工作流 + code-explorer/code-architect/code-reviewer 三个内置 Agent，对中小型、单次交付的需求更高效' },
    { key: 'not-exclusive', label: '不是"二选一淘汰"：大型项目仍有人两者结合用，本次按需求体量选 feature-dev' },
  ],
  ourChoice:
    '本次"vibecoding 平台化治理"需求——PRD 澄清、技术方案、连同这份汇报本身——全程正是用 feature-dev 七阶段工作流（Discovery → Codebase Exploration → Clarifying Questions → Architecture Design → Implementation → Quality Review → Summary）跑出来的。选 feature-dev 不是纸上谈兵，是这份 PPT 诞生过程本身的真实记录。',
  sourceNote: '两个插件的能力对比参考 Claude Code 官方插件页与社区讨论，随两者各自演进可能变化，仅作本次工具选型依据，非绝对结论。',
  analogy: '大白话：Superpowers 像一整套完整装修公司体系（设计+施工+验收+售后），适合大项目；Feature Dev 像官方推的"标准装修套餐"，步骤精简、上手快——这次装修用的就是标准套餐。',
}

const caseStudySlide: CaseStudySlide = {
  id: 'case-study',
  kind: 'case-study',
  master: 'content-dual',
  heading: '一个界面，调度多种 AI Coding 引擎',
  multiEngine: {
    title: 'Forge 统一管理项目、会话与引擎执行句柄',
    points: [
      '从项目模块入口创建会话，平台自动绑定对应工作目录（cwd）',
      '统一适配 Claude Code / Codex / Gemini / OpenCode 四种执行引擎',
      '用户在 Forge 界面下达任务，平台负责路由、启动、停止与输出回传',
      '每个引擎保留独立的可续跑执行句柄，切换引擎不会互相覆盖',
    ],
  },
  lifecycle: {
    title: '同一套调度壳，承接不同引擎的生命周期',
    states: ['空闲', '运行中', '被中断（可续跑，非报废态）', '已结束'],
    highlight: '"被中断"是一等公民状态——应对"AI 结对编程中途出问题是常态"这一现实。',
  },
  provenanceNote:
    '本节口径来自 Forge 项目知识图谱中的 Claude Chat 会话概念与会话生命周期两条记录，当前标注 stability: draft，成稿前需 Claude Chat 模块 owner 现场核实（PRD 风险 R1，本页面呈现为待核实草拟口径，非已验证事实）。',
  analogy: '大白话：会话就像一个专属工作台抽屉——换了操作的师傅，抽屉还是原来那个，东西不会被搞混。抽屉暂时锁上（被中断）不代表东西被扔了，回来还能接着用。',
}

const docGovernanceSlide: DocGovernanceSlide = {
  id: 'doc-governance',
  kind: 'doc-governance',
  master: 'content-dual',
  heading: '每一次开发，都留下可以继续工作的记忆',
  trail: [
    {
      key: 'prd',
      label: 'PRD · 需求原点',
      detail: '记录为什么做、做什么、边界在哪里，以及最终如何验收',
    },
    {
      key: 'dev-doc',
      label: '开发文档 · 实施事实',
      detail: '把 PRD 转成方案、影响范围、任务和约束，成为编码的当前依据',
    },
    {
      key: 'session',
      label: '开发会话 · 执行现场',
      detail: '会话关联开发文档与项目目录，编码过程、决策和验证都有来源',
    },
    {
      key: 'archive',
      label: '新版本 · 自动归档',
      detail: '重要变更回写新版开发文档，沉淀本轮进度与记忆（OpenSpec 思想）',
    },
    {
      key: 'resume',
      label: '下一次 · 从最新事实续接',
      detail: '新会话先加载当前版本，不再重新梳理已经完成的上下文',
    },
  ],
  versionStat: [
    { label: '读取最新开发文档与代码进度，估算剩余工作和交付时间', value: '进度可推算' },
    { label: '对照 PRD 与开发文档版本，识别需求遗漏、方案偏差和返工来源', value: '变更可归因' },
    { label: '汇总知识缺口、AI 约束缺口与审核错漏，持续优化团队治理', value: '问题可复盘' },
  ],
  toolEvidence:
    '结果：需求有原点、实施有事实、过程有记忆、结果可验证；任何人接手，都能从团队当前进度继续。',
  analogy: '大白话：从"一句话想法"到"施工图纸"到"完工验收单"，每一步都留底——接手的人不用靠"听人转述"，翻记录就知道当初为什么这么改。',
}

const quantSlide: QuantSlide = {
  id: 'quant-data',
  kind: 'quant',
  master: 'content-dual',
  heading: '治理成果量化数据',
  stats: [
    { label: 'PRD 澄清轮次', value: generatedQuantData.prd.clarificationRounds, unit: '轮' },
    { label: 'PRD 结构化章节', value: generatedQuantData.prd.chapterCount, unit: '章' },
    { label: '可验收标准', value: generatedQuantData.prd.acceptanceCriteriaCount, unit: '条' },
    { label: '显式风险项', value: generatedQuantData.prd.riskCount, unit: '条' },
  ],
  insights: generatedQuantData.insights,
  disclaimer:
    '以上数据均来自本需求自身的 PRD/开发文档文本结构化解析（详见 generatedQuantData.json 与生成脚本），不引用 yoooni-hook-report 的真实 hook-events/prompt-signals 统计；样本仅为一次 PRD 澄清，定位为方法论演示而非效果证明。',
  analogy: '大白话：不是晒"战绩海报"，是把这次沟通改了几次图纸、消掉了几处分歧，老老实实用数字说清楚。',
}

const outlookSlide: OutlookSlide = {
  id: 'outlook',
  kind: 'outlook',
  master: 'content-dual',
  heading: '当前平台能力：一个入口，连接项目开发所需的一切',
  thesis: 'Forge 已经把环境、知识、文档、模块和 AI 会话收进同一个可视化工作台。',
  foundations: [
    { key: 'environment', icon: '⚙️', title: '环境可复制', detail: '项目负责人维护 Windows / macOS 标准启停脚本，控制台一键启动' },
    { key: 'knowledge', icon: '🧠', title: '知识持续更新', detail: '历史文档、业务知识与 Graphify 代码现状共同补充开发上下文' },
    { key: 'documents', icon: '📐', title: '文档统一结构', detail: 'PRD 与开发文档采用统一大纲，便于 AI 执行、迭代和统一分析' },
    { key: 'modules', icon: '🧩', title: '模块可视化维护', detail: '选择项目模块后，直接在正确目录拉起绑定上下文的开发会话' },
  ],
  futures: [
    { key: 'module-entry', index: '01', title: '项目与模块从统一入口启动', detail: '选择模块后直接在正确目录拉起会话，不再依赖个人记忆路径。' },
    { key: 'runtime-console', index: '02', title: '服务启停与日志集中管理', detail: '标准脚本、运行状态和启动日志都可以在 Forge 控制台完成。' },
    { key: 'traceable-assets', index: '03', title: '文档、知识与会话形成关联', detail: '每次需求有 PRD、有开发文档、有对应会话，过程能够继续和回查。' },
  ],
  outcome: '当前结果：开发可以从正确模块、标准环境和完整上下文开始，并持续留下可复用的团队资产。',
  analogy: '大白话：现在先把工地、电路图、施工手册和入口统一好；未来无论新人还是业务人员，都能找到正确的门、问到靠谱的人、直接开始工作。',
}

const outlookDetailSlides: OutlookDetailSlide[] = [
  {
    id: 'outlook-module-command-center', kind: 'outlook-detail', master: 'content-dual', status: '已上线', statusTone: 'live', icon: '🧩',
    heading: '项目工作台已经把“找项目、找模块、开会话”变成一次点击',
    promise: '开发从正确的项目、正确的模块和正确的知识上下文直接开始。',
    currentPain: '过去最容易浪费的不是编码时间，而是找目录、找入口、确认上下文和重新解释模块边界。',
    actions: [
      { key: 'project', title: '项目与模块可视化选择', detail: '项目、模块、技术栈和知识状态集中呈现，不再依赖个人记路径。' },
      { key: 'session', title: '在模块目录直接拉起会话', detail: '新会话天然绑定模块路径，并预置前后端编码范围。' },
      { key: 'knowledge', title: '知识图谱状态一眼可见', detail: 'Graphify、业务知识和跨系统知识是否就绪，可以统一检测和更新。' },
    ],
    benefits: ['减少上下文串线', '降低错误目录开发风险', '项目资产对负责人可见'],
    closing: '这不是一个新的聊天入口，而是团队统一的 AI 开发入口。',
    analogy: '大白话：以前是先在园区里找楼、找楼层、找房间；现在从总控台点一下，直接站到正确工位上。',
  },
  {
    id: 'outlook-environment-standard', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '⚙️',
    heading: '把个人电脑上的启动经验，变成公司的标准能力',
    promise: '项目负责人维护一次跨平台脚本，团队成员在控制台一键启停。',
    currentPain: '环境差异、启动参数和 IDE 配置长期掌握在个人手里，新成员和换电脑都要重新踩坑。',
    actions: [
      { key: 'scripts', title: 'Windows / macOS 双脚本约定', detail: '项目负责人维护兼容脚本，把端口、依赖和启动顺序固化下来。' },
      { key: 'console', title: '启停操作进入统一控制台', detail: '启动、停止和重启不再依赖某个人熟悉哪一种 IDE。' },
      { key: 'logs', title: '启动日志和健康状态集中查看', detail: '失败发生在哪里、服务是否就绪，可以在同一个页面判断。' },
    ],
    benefits: ['环境准备可复制', '新成员少走弯路', '故障定位不靠口口相传'],
    closing: '环境不再是每个人的私人作业，而是项目可以交付、可以复用的组成部分。',
    analogy: '大白话：不是教每个新人重新接水电，而是项目交付时就把总开关和操作说明一起装好。',
  },
  {
    id: 'outlook-living-knowledge', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '🧠',
    heading: '知识库不再是一批静态文档，而是持续更新的开发底座',
    promise: 'AI 同时理解业务规则、历史决策和代码当前真实实现。',
    currentPain: '只读文档会过期，只读代码又看不懂业务原因；单一知识源都不足以支撑可靠开发。',
    actions: [
      { key: 'business', title: '业务知识图谱沉淀长期规则', detail: '业务概念、状态机和跨系统关系形成团队共同认可的业务真理。' },
      { key: 'graphify', title: 'Graphify 跟随项目代码更新', detail: '模块、调用链、依赖和影响范围随代码演进重新生成。' },
      { key: 'history', title: 'PRD 与开发文档保留历史依据', detail: '需求为什么变化、方案为什么调整，可以沿同一需求链路回放。' },
    ],
    benefits: ['回答更有依据', '降低强人依赖', '改动前看清影响范围'],
    closing: '业务知识解释“为什么”，代码图谱回答“现在怎样”，历史文档留下“当时怎么决定”。',
    analogy: '大白话：既有长期有效的施工规范，也有每栋楼最新线路图，还有每次改造留下的施工记录。',
  },
  {
    id: 'outlook-document-standard', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '📐',
    heading: '统一文档大纲，让 AI 的执行过程可预测、可比较、可复盘',
    promise: '同一类需求使用同一套信息结构，AI 不必每次猜“还缺什么”。',
    currentPain: 'PRD 和开发文档深浅不一，会直接导致澄清遗漏、方案跳步和验收口径不一致。',
    actions: [
      { key: 'prd', title: 'PRD 统一描述目标与边界', detail: '背景、范围、非目标、数据和验收条件有固定位置。' },
      { key: 'design', title: '开发文档统一描述怎么实现', detail: '代码影响、接口、数据库、任务清单和风险按同一结构展开。' },
      { key: 'versions', title: '版本差异成为流程分析依据', detail: '每次返工可以追到需求、PRD 或方案阶段的具体缺口。' },
    ],
    benefits: ['AI 执行更有序', '跨项目结果可比较', '后续复盘和归因更容易'],
    closing: '文档标准不是增加格式工作，而是让团队和 AI 使用同一种思考顺序。',
    analogy: '大白话：所有施工队都按同一套图纸目录交付，接手的人不用重新学习每个人的写法。',
  },
  {
    id: 'outlook-business-assistant', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '💬',
    heading: '业务人员也能在任意模块，问到有依据的答案',
    promise: '业务人员可以从模块入口调用结合业务知识和代码现状的专属助手。',
    currentPain: '业务问题集中找少数专家确认，答案分散在聊天记录里，还可能与代码现状脱节。',
    actions: [
      { key: 'scope', title: '从模块入口启动专属助手', detail: '问题自动绑定项目和模块，避免跨系统知识混用。' },
      { key: 'evidence', title: '同时查询业务与代码知识', detail: '既解释规则，也核对当前系统是否真的这样实现。' },
      { key: 'honesty', title: '给出依据、差异和不确定项', detail: '无法确认时明确提示补充材料或转交专家，而不是编造答案。' },
    ],
    benefits: ['减少重复咨询专家', '业务决策获得更快反馈', '团队口径逐步统一'],
    closing: '知识库不只服务开发人员，也已经成为业务团队可以直接使用的组织能力。',
    analogy: '大白话：每个业务模块旁边都坐着一位熟悉制度、也看得懂系统现状的助理。',
  },
  {
    id: 'outlook-developer-onboarding', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '🚀',
    heading: '新成员拿到电脑，就能一键进入可工作的项目环境',
    promise: '平台把“发一份搭环境文档”升级为“交付一个可运行的开发入口”。',
    currentPain: '项目分散、磁盘路径不同、依赖版本复杂，新人往往先花大量精力证明环境能跑。',
    actions: [
      { key: 'path', title: '约定统一磁盘与工作区规则', detail: '平台知道项目应该放在哪里，不再依赖手动选择和口头约定。' },
      { key: 'clone', title: '自动拉取所需公司项目', detail: '按岗位或任务清单准备代码仓和知识仓，避免漏项目。' },
      { key: 'ready', title: '自动启停并完成就绪检查', detail: '服务、端口和必要依赖确认通过后，直接进入开发会话。' },
    ],
    benefits: ['缩短入场准备链路', '减少环境差异', '负责人不再重复陪跑配置'],
    closing: '新人拿到的不再是一堆链接，而是一个经过验证、可以立即工作的环境。',
    analogy: '大白话：不是给新人一箱零件和说明书，而是交付一套已经通水通电的工位。',
  },
  {
    id: 'outlook-delivery-intelligence', kind: 'outlook-detail', master: 'content-dual', status: '当前能力', statusTone: 'live', icon: '📊',
    heading: 'AI 不只执行单个需求，还能帮助负责人安排一组需求',
    promise: '平台用 PRD、开发文档和代码证据形成可解释的交付视图。',
    currentPain: '需求进度靠人工追问，相似需求分散排期，同一模块可能被多次重复修改。',
    actions: [
      { key: 'progress', title: '基于交付物自动评估进度', detail: '从 PRD、方案、代码改动和审查结果判断真实阶段，而不是只看口头状态。' },
      { key: 'classify', title: '自动归类到项目和业务模块', detail: '把需求映射到受影响模块，形成负责人可以浏览的需求组合。' },
      { key: 'merge', title: '识别同模块合并开发机会', detail: '发现改动范围高度重叠的需求，给出合并设计、测试和发布建议。' },
    ],
    benefits: ['进度更透明', '减少重复改动', '排期与资源决策更有依据'],
    closing: '平台不仅提升单个开发者效率，也帮助负责人优化整个需求组合。',
    analogy: '大白话：AI 不只是一个施工工人，还会逐步成为能看懂多张工单、提醒合并施工的项目调度员。',
  },
]

const adoptionSlide: AdoptionSlide = {
  id: 'adoption',
  kind: 'adoption',
  master: 'summary',
  heading: '采纳倡议与下一步',
  onboardingSteps: [
    '安装 team-standards 插件族',
    '需求澄清与开发统一从 /feature-dev:feature-dev 主流程进入',
    '在 Phase 5 前显式接入 pre-implementation-code-orientation，不依赖模型自行命中',
    '遇到规范偏差，用 coding-violation-log 留痕，反哺知识图谱',
  ],
  valueProps: ['需求不跑偏', '文档不缺失', '问题可追溯'],
  roadmapTeaser:
    '下一步优先级：先把 Feature Dev → 编码前定位 Skill 的显式接线补齐，再建设长期治理看板；本次不承诺上线时间。',
  analogy: '大白话：团队装修从"各凭手感"变成"先领图纸再动工，问题随手记本子"——不是加流程负担，是少返工。',
}

export const slides: Slide[] = [
  coverSlide,
  northStarSlide,
  openingSlide,
  architectureSlide,
  kgChoiceSlide,
  openspecDecisionSlide,
  toolChoiceSlide,
  caseStudySlide,
  docGovernanceSlide,
  quantSlide,
  outlookSlide,
  ...outlookDetailSlides,
  adoptionSlide,
]

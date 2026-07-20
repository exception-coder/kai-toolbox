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
}

export interface CoverSlide extends SlideBase {
  kind: 'cover'
  master: 'cover'
  eyebrow: string
  title: string
  subtitle: string
}

export interface OpeningSlide extends SlideBase {
  kind: 'opening'
  master: 'content-single'
  heading: string
  painPoints: string[]
  thesis: string
}

export interface ArchitectureLayer {
  key: string
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
  principle: string
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
  status: 'done' | 'planned'
  detail: string
}

export interface ClosedLoopSlide extends SlideBase {
  kind: 'closed-loop'
  master: 'content-single'
  heading: string
  clarificationTopics: string[]
  stages: ClosedLoopStage[]
  dataSourceDisclaimer: string
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

export type Slide =
  | CoverSlide
  | OpeningSlide
  | ArchitectureSlide
  | CaseStudySlide
  | ClosedLoopSlide
  | QuantSlide
  | AdoptionSlide

const coverSlide: CoverSlide = {
  id: 'cover',
  kind: 'cover',
  master: 'cover',
  eyebrow: 'KAI-TOOLBOX · 展示',
  title: 'VibeCoding 平台化治理',
  subtitle: '把 Skill / Hooks / MCP / 知识图谱 / Plugin 串成一条可验收的开发闭环',
}

const openingSlide: OpeningSlide = {
  id: 'opening',
  kind: 'opening',
  master: 'content-single',
  heading: '开篇 · 问题与目标',
  painPoints: [
    '多人协作开发中 PRD 经常缺失，需求口径全靠口口相传',
    '开发文档滞后于代码，一段时间后没人说得清"当时为什么这么改"',
    '问题反复出现却没有可回溯的记录，同样的坑不同的人反复踩',
    '治理能力（插件/知识图谱）分散在各处，团队对"为什么要遵循这套流程"缺乏整体认知',
  ],
  thesis: '用统一开发治理平台，把"讲清楚价值"和"说服大家采用"这两件事一起做成。',
}

const architectureSlide: ArchitectureSlide = {
  id: 'architecture',
  kind: 'architecture',
  master: 'content-single',
  heading: '平台能力抽象架构',
  intro: '一条需求，从输入到沉淀，穿过五层协作。',
  layers: [
    {
      key: 'skill',
      label: 'Skill 层',
      detail: 'design-doc-required / doc-index-required / dev-log / pre-implementation-code-orientation / coding-violation-log',
      solves: '引导做正确的事：澄清 PRD、生成开发文档、编码前定位、违规纠偏留痕',
    },
    {
      key: 'hooks',
      label: 'Hooks 层',
      detail: '流程节点强制拦截与提醒（如未写文档不允许继续改代码）',
      solves: '强制不漏做',
    },
    {
      key: 'mcp',
      label: 'MCP 层',
      detail: 'domain-knowledge / cross-topology 等，跨会话提供业务认知查询能力',
      solves: '经验可查询，不依赖记忆',
    },
    {
      key: 'graph',
      label: '知识图谱层',
      detail: 'backend-knowledge-graph-required 沉淀的业务规则 / 状态机 / 技术难点',
      solves: '经验可沉淀、可回溯、不失传',
    },
    {
      key: 'plugin',
      label: 'Plugin 层',
      detail: '以上能力打包为可安装、可复用的 Claude Code 插件（team-standards 等）',
      solves: '能力可复制，团队可复用，而非个人经验',
    },
  ],
  principle:
    'openspec「先有规范再动代码」→ 对应本平台 PRD/开发文档先行的强制顺序；superpower「给 AI 装备可复用能力包」→ 对应 Skill/Plugin 化的分发模式。',
}

const caseStudySlide: CaseStudySlide = {
  id: 'case-study',
  kind: 'case-study',
  master: 'content-dual',
  heading: '落地案例 · Claude Chat 多引擎会话管理',
  multiEngine: {
    title: '会话是绑定工作目录的持久实体，不是一问一答',
    points: [
      '已接入 Claude Code / Codex / Gemini / OpenCode 四种 code 引擎，同一会话内可切换',
      '会话固定绑定一个工作目录（cwd），换目录即换会话',
      '引擎可切换，但会话的"人格"（标题、归属目录、历史沿革）不变',
      '每个引擎各自持有独立的可续跑执行句柄，切换引擎不会互相覆盖上下文',
    ],
  },
  lifecycle: {
    title: '会话生命周期（状态机）',
    states: ['空闲', '运行中', '被中断（可续跑，非报废态）', '已结束'],
    highlight: '"被中断"是一等公民状态——应对"AI 结对编程中途出问题是常态"这一现实。',
  },
  provenanceNote:
    '本节口径来自项目知识图谱 kai-toolbox-claude-chat-session-concept / kai-toolbox-claude-chat-session-lifecycle 两条记录，当前标注 stability: draft，成稿前需 Claude Chat 模块 owner 现场核实（PRD 风险 R1，本页面呈现为待核实草拟口径，非已验证事实）。',
}

const closedLoopSlide: ClosedLoopSlide = {
  id: 'closed-loop',
  kind: 'closed-loop',
  master: 'content-single',
  heading: '标准化闭环故事（自举案例）',
  clarificationTopics: generatedQuantData.prd.clarificationTopics,
  stages: [
    { key: 'prd', label: 'PRD 澄清', status: 'done', detail: `${generatedQuantData.prd.clarificationRounds} 轮问答，把一句话需求收敛为 ${generatedQuantData.prd.chapterCount} 章结构化 PRD` },
    { key: 'dev-doc', label: '开发文档', status: 'done', detail: '基于 PRD 生成技术方案文档，记录版本迭代（本页数据即来自这份迭代记录）' },
    { key: 'implementation', label: '代码实现', status: 'done', detail: '经 pre-implementation-code-orientation 定位、coding-standards-common 规范约束后落地本页面' },
    { key: 'retrospective', label: '问题回溯与修正', status: 'planned', detail: '如遇实现偏差，按 coding-violation-log 留痕并沉淀进知识图谱——本期尚未发生真实回溯记录，不提前编造' },
  ],
  dataSourceDisclaimer:
    '数据来源：本需求自身的 PRD 版本更新记录、开发文档更新记录，不暗示或引用其他历史需求的真实回溯案例。',
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
}

const adoptionSlide: AdoptionSlide = {
  id: 'adoption',
  kind: 'adoption',
  master: 'summary',
  heading: '采纳倡议与下一步',
  onboardingSteps: [
    '安装 team-standards 插件族',
    '下一个需求，先用 design-doc-required 走一遍 PRD 澄清',
    '编码前用 pre-implementation-code-orientation 做一次定位',
    '遇到规范偏差，用 coding-violation-log 留痕，反哺知识图谱',
  ],
  valueProps: ['需求不跑偏', '文档不缺失', '问题可追溯'],
  roadmapTeaser:
    '下一步方向：治理看板（长期数据采集与展示）——这是独立需求，具体范围、上线时间另行 PRD 澄清，本次不承诺时间表。',
}

export const slides: Slide[] = [
  coverSlide,
  openingSlide,
  architectureSlide,
  caseStudySlide,
  closedLoopSlide,
  quantSlide,
  adoptionSlide,
]

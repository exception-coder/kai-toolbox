import { BookOpen, Bot, Code2, FlaskConical, GitBranch, Orbit, ScanLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const categories = ['全部', 'AI 研发', '理解与探索', '自动化', '质量'] as const
export type Category = typeof categories[number]

export interface Capability {
  id: string
  name: string
  category: Exclude<Category, '全部'>
  icon: LucideIcon
  promise: string
  description: string
  scenarios: string[]
  steps: string[]
  destination: string
  action: string
  entryHint: string
  featured?: boolean
  guidePath?: string
}

export const capabilities: Capability[] = [
  {
    id: 'rainbow', name: '彩虹胶囊', category: 'AI 研发', icon: Orbit, featured: true,
    promise: '想法，就在发生的地方被接住。',
    description: '把 Forge 带进你正在使用的业务页面。带着页面上下文提问、描述问题，让业务与研发的沟通从同一个现场开始。',
    scenarios: ['使用业务系统时，需要解释当前页面或操作', '发现问题，想保留现场上下文再沟通', '为自己的业务系统接入统一助手'],
    steps: ['业务现场', '描述问题', '带上下文交流', '继续跟进'],
    destination: '/tools/assistant-integration', action: '了解如何接入',
    entryHint: '打开嵌入式业务助手，查看接入方式。接入后，在业务页面使用彩虹胶囊；需要整理开发需求时，可继续使用 AI 需求中枢。',
  },
  {
    id: 'delegation', name: '委托', category: '自动化', icon: Orbit, featured: true,
    promise: '让业务直接参与，让研发掌握边界。',
    description: '把已有研发会话授权给指定参与者。对方提交需求、回答业务问题、查看进展；项目配置与风险审批仍由会话所有者掌握。',
    scenarios: ['邀请业务同事直接澄清需求', '让指定参与者在受约束的会话中推进开发', '将参与者会话嵌入自己的产品'],
    steps: ['所有者授权', '参与者连接', '沟通与执行', '所有者复核'],
    destination: '/tools/claude-chat', action: '前往会话委托',
    entryHint: '进入 Vibe Coding，创建或选择一个会话，再打开「委托」，选择参与者并创建邀请。参与者使用自己的 Forge 身份兑换邀请；风险操作由所有者处理。',
    guidePath: '/explore/delegation',
  },
  {
    id: 'coding', name: '协同开发', category: 'AI 研发', icon: Code2,
    promise: '说清目标，和 Agent 一起推进代码。',
    description: '在项目会话中讨论方案、推进修改；用 OpenSpec 自动监督任务，以受约束委托连接业务参与者。',
    guidePath: '/explore/vibe-coding',
    scenarios: ['实现一个明确的功能', '排查问题并讨论修复方案'],
    steps: ['选择项目', '描述目标', '协同修改', '检查结果'],
    destination: '/tools/claude-chat', action: '开始研发会话', entryHint: '进入 Vibe Coding 后选择项目并创建会话。具体执行能力取决于项目与 Agent 配置。',
  },
  {
    id: 'understanding', name: '代码理解', category: '理解与探索', icon: ScanLine,
    promise: '从一个问题，找到代码里的来龙去脉。',
    description: '围绕真实项目提问，追踪入口、调用与业务逻辑，为下一步修改建立依据。',
    scenarios: ['接手陌生项目', '定位一段业务逻辑及其影响范围'],
    steps: ['提出问题', '检索代码', '追踪关系', '核对证据'],
    destination: '/tools/claude-chat', action: '去理解项目', entryHint: '进入项目会话后描述要理解的问题，并提供相关页面或代码线索。',
  },
  {
    id: 'requirements', name: '需求探索', category: '理解与探索', icon: BookOpen,
    promise: '把模糊的想法，整理成可以推进的需求。',
    description: '在 AI 需求中枢统一登记想法，梳理价值与范围，并结合规格和执行证据跟进进度。',
    scenarios: ['想法还不完整，需要澄清边界', '需要统一跟进多条开发需求'],
    steps: ['登记想法', '分析价值', '明确方案', '跟进进度'],
    destination: '/tools/reqpool', action: '打开需求中枢', entryHint: '进入 AI 需求中枢，登记或选择一条需求开始探索。',
  },
  {
    id: 'evaluation', name: '回归评测', category: '质量', icon: FlaskConical,
    promise: '改进有没有生效，用评测结果说话。',
    description: '围绕黄金集与断言比较表现，发现从通过到失败的退化，减少凭感觉判断质量。',
    scenarios: ['调整提示词后比较效果', '检查已有用例是否发生退化'],
    steps: ['准备样本', '执行评测', '比较结果', '定位退化'],
    destination: '/tools/eval', action: '打开回归评测', entryHint: '进入回归评测，使用已配置的样本与断言开展验证。',
  },
  {
    id: 'agents', name: 'Agent 治理', category: '自动化', icon: Bot,
    promise: '让每一个 Agent 的配置与版本有据可查。',
    description: '集中查看 Agent 配置、评测和版本发布，让持续使用的 AI 能力得到统一管理。',
    scenarios: ['维护多个 Agent 的配置', '查看评测与发布信息'],
    steps: ['登记 Agent', '管理配置', '查看评测', '跟踪版本'],
    destination: '/tools/agent-management', action: '查看 Agent', entryHint: '进入 Agent 管理，查看当前登记的 Agent；可用操作遵循账号权限。',
  },
  {
    id: 'engineering', name: '工程全景', category: '理解与探索', icon: GitBranch,
    promise: '看清工具如何协作，也理解它为什么这样工作。',
    description: '通过实现原理的可视化说明，了解 Forge 的研发协作与模块架构。',
    scenarios: ['向团队介绍研发工作方式', '了解产品的架构与实现取舍'],
    steps: ['选择主题', '浏览架构', '理解链路', '回到实践'],
    destination: '/tools/architecture', action: '查看实现原理', entryHint: '打开实现原理，选择 Vibe Coding 或团队协作等主题。',
  },
]

export const featuredCapabilities = capabilities.filter(capability => capability.featured)

import { Link } from 'react-router-dom'
import {
  ArrowLeft, UserSearch, Layers, ShieldCheck, Scale, Boxes, Network,
  Cpu, Database, Server, GitBranch, AlertTriangle, CheckCircle2,
  Repeat, Plug, Code2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Section, HFlow, VFlow, InfoCard, DecisionCard, GuardCard, CodeBlock,
  type Decision,
} from '../components/arch-ui'
import { TechArchitectureMap, type TechArchitectureMapProps } from '../components/TechArchitectureMap'
import { StakeholderArchitectureViews, type StakeholderArchitectureViewsProps } from '../components/StakeholderArchitectureViews'

/* ──────────────────────────────────────────
   数据
────────────────────────────────────────── */

const decisions: Decision[] = [
  {
    topic: 'LLM 调用形式：单次结构化输出 vs ReAct 工具循环',
    chosen: {
      name: '单次结构化输出（JSON Schema 约束）',
      reason: '确定性步骤（归一化/查库/增强）全在代码里按固定顺序跑，不需要让模型自己选工具；模型只做最后那步"给我一个枚举 + 理由"——结构稳、延迟低、最贴 deterministic-first。',
    },
    rejected: [
      {
        name: 'ReAct Agent 工具循环',
        reason: '第三方 OpenAI 兼容平台 function-calling 支持参差不齐；且"查客户库"是确定性 SQL，不应放进概率性工具路由。循环更难控置信度与超时。',
      },
    ],
  },
  {
    topic: 'Sidecar 语言：Python vs Java 内嵌 LLM',
    chosen: {
      name: 'Python FastAPI sidecar（独立进程）',
      reason: 'AgentScope 是 Python 框架（学习目标）；Python 生态有企查查/天眼查等企业数据增强 SDK；与 Java 解耦，换模型/框架只改 sidecar；crashloop 不影响主服务。',
    },
    fallback: {
      name: 'Java 直接调 LLM（OpenAI 兼容）',
      reason: 'sidecar 不可用时的自动降级路径：Java 端的 SidecarClient 返回 null → VerdictService 直接落 UNKNOWN + needsReview=true，整体不崩。',
    },
    rejected: [
      {
        name: 'Java LLM 调用（LangChain4j）',
        reason: 'AgentScope 本身的学习目标就在 Python 侧；且企业数据增强 SDK 生态在 Python 更完整。',
      },
    ],
  },
  {
    topic: '匹配置信度：规则 vs LLM',
    chosen: {
      name: '规则命中 0.95+，LLM 提议 < reviewThreshold 则待复核',
      reason: '规则层命中（手机/公司名精确匹配）是确定事实，赋高置信；LLM 输出是概率性提议，低于配置阈值时标 needsReview，不自动入库为"已确认"——"LLM 提议，代码裁决"。',
    },
    rejected: [
      { name: '统一让 LLM 给置信度', reason: 'LLM 的置信度是"感觉"，不可信；规则命中的确定性事实本不该让模型"再估一遍"。' },
    ],
  },
  {
    topic: '企业数据增强',
    chosen: {
      name: '模拟桩 + degraded 标记（当前状态）',
      reason: '接口签名稳定（enrich_company 函数），桩返回 degraded=True；Java 端把 degraded 体现到 needsReview。真实接入只换实现，不改协议。',
    },
    fallback: {
      name: '企查查 / 天眼查适配器',
      reason: '签名不变，替换桩内部实现；可提升灰区判别准确率（行业/经营范围上下文给 LLM）。',
    },
    rejected: [],
  },
]

const guards: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: 'LLM 输出非法枚举值', guard: 'IdentityType.parse / RelationshipType.parse 归一化，越界归 UNKNOWN；代码裁决，不信 LLM 字符串' },
  { tag: '②', risk: '置信度越界（<0 或 >1）', guard: 'clamp(0.0, 1.0)；LLM 多报 "0.9"，代码限死范围' },
  { tag: '③', risk: 'sidecar 不可用', guard: '降级为 UNKNOWN + needsReview=true；主服务不崩；前端显示"sidecar 未在线"提示' },
  { tag: '④', risk: 'LLM API key 未配置', guard: 'Python 侧先检查 VA_LLM_API_KEY，缺失直接返回 UNKNOWN + rationale="未配置 key"；避免空调用' },
  { tag: '⑤', risk: 'LLM 幻觉（"客户已成交"）', guard: 'System Prompt 明确：是否老客户由系统客户库决定，不在 LLM 判断范围；结论来自代码，LLM 只给灰区分类' },
  { tag: '⑥', risk: '公司名别名/简称不匹配', guard: 'Normalizer 归一化（去"有限公司/集团/股份"等后缀）；LIKE 宽松查；多字段交叉（手机 + 公司双路）' },
  { tag: '⑦', risk: '竞品伪装为客户', guard: '竞品名单优先级最高：hitCompetitor 直接定论，不再看是否也在客户库' },
]

const coreSteps = [
  { title: '① 归一化', desc: 'Normalizer：手机标准化（+86/空格）\n公司去后缀归一', tone: 'muted' as const },
  { title: '② 落访客记录', desc: 'VisitorRepository.insert\n（原始+归一化字段并存）' },
  { title: '③ 确定性匹配', desc: 'MatchService：查客户库\n查竞品名单 · 命中即定', tone: 'primary' as const },
  { title: '⑤ 代码裁决', desc: '枚举校验 + clamp + threshold\n→ VerdictRepository.insert', tone: 'accent' as const },
]

const architectureLanes = [
  {
    label: '入口层',
    tone: 'blue',
    nodes: [
      { name: '访客登记 UI', detail: '表单输入 / 结果展示 / 历史列表' },
      { name: 'REST API', detail: 'analyze-sync / verdicts / sidecar-health' },
    ],
  },
  {
    label: 'Java 编排层',
    tone: 'violet',
    nodes: [
      { name: 'VisitorAnalysisController', detail: '接收请求，暴露同步/异步接口' },
      { name: 'VerdictService', detail: '主编排：归一化 → 匹配 → 裁决 → 落库' },
      { name: 'Normalizer', detail: '手机号、公司名确定性归一' },
    ],
  },
  {
    label: '确定性能力层',
    tone: 'emerald',
    nodes: [
      { name: 'CompetitorRepo', detail: '竞品名单优先，命中即定 COMPETITOR' },
      { name: 'CustomerRepo', detail: '手机/公司匹配客户库，识别熟客/流失' },
      { name: 'VisitorRepo', detail: '历史来访次数，补充灰区上下文' },
    ],
  },
  {
    label: '灰区智能层',
    tone: 'orange',
    nodes: [
      { name: 'SidecarClient', detail: '只在规则无法定论时 POST /analyze' },
      { name: 'Python FastAPI', detail: 'enrich_company + classify 一次结构化输出' },
      { name: 'OpenAI 兼容 / AgentScope', detail: '当前 OpenAI SDK，AgentScope 为接入点' },
    ],
  },
  {
    label: '裁决与观测层',
    tone: 'rose',
    nodes: [
      { name: '代码裁决', detail: '枚举校验 / clamp / 阈值 / degraded' },
      { name: 'SQLite', detail: 'visitor / verdict / customer / competitor / feedback' },
      { name: 'AgentScope Studio', detail: '端口 3000，接入后展示 trace/token/cost' },
    ],
  },
] as const

const callChainSteps = [
  { no: '01', title: '访客提交登记', detail: '姓名、手机、公司、来访目的进入前端表单', tone: 'blue' },
  { no: '02', title: '前端调用 Java API', detail: 'POST /api/visitor-analysis/analyze-sync', tone: 'blue' },
  { no: '03', title: 'Controller 转入编排', detail: 'VisitorAnalysisController → VerdictService', tone: 'violet' },
  { no: '04', title: '归一化输入', detail: 'Normalizer 生成 phoneNorm / companyNorm', tone: 'violet' },
  { no: '05', title: '保存原始访客', detail: 'VisitorRepo.insert 保留原始字段与归一化字段', tone: 'rose' },
  { no: '06', title: '竞品优先匹配', detail: 'CompetitorRepo 命中直接输出 COMPETITOR', tone: 'emerald' },
  { no: '07', title: '客户库匹配', detail: 'CustomerRepo 判断 EXISTING / CHURNED', tone: 'emerald' },
  { no: '08A', title: '规则路径定论', detail: '高置信 verdict，跳过 LLM', tone: 'emerald' },
  { no: '08B', title: '灰区转 sidecar', detail: 'SidecarClient POST Python /analyze', tone: 'orange' },
  { no: '09', title: '企业增强 + LLM', detail: 'enrich_company 后输出 SidecarVerdict 提议', tone: 'orange' },
  { no: '10', title: '代码裁决', detail: 'Java 校验枚举、置信度、阈值和降级标记', tone: 'rose' },
  { no: '11', title: '结论落库', detail: 'VerdictRepo.insert，decidedBy 标记 rule/llm/degraded', tone: 'rose' },
  { no: '12', title: '前端/监控读取', detail: '页面展示结果；Studio 展示 AgentScope trace（接入后）', tone: 'blue' },
] as const

const toneStyles = {
  blue: {
    lane: 'border-blue-500/35 bg-blue-500/5',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    accent: 'text-blue-700 dark:text-blue-300',
  },
  violet: {
    lane: 'border-violet-500/35 bg-violet-500/5',
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    accent: 'text-violet-700 dark:text-violet-300',
  },
  emerald: {
    lane: 'border-emerald-500/35 bg-emerald-500/5',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    accent: 'text-emerald-700 dark:text-emerald-300',
  },
  orange: {
    lane: 'border-orange-500/35 bg-orange-500/5',
    badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    accent: 'text-orange-700 dark:text-orange-300',
  },
  rose: {
    lane: 'border-rose-500/35 bg-rose-500/5',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    accent: 'text-rose-700 dark:text-rose-300',
  },
} as const

const visitorTechMap: TechArchitectureMapProps = {
  title: '访客分析技术架构全景',
  subtitle: '用一张图把前端、Java 主服务、确定性匹配、Python AgentScope sidecar、监控和 SQLite 持久化串起来。',
  top: ['React Feature', 'Spring Boot API', 'Python FastAPI', 'SQLite / AgentScope Studio'],
  clients: ['VisitorAnalysisPage', 'REST API', 'SSE 进度流', 'SidecarClient', 'AgentScope Studio'],
  left: ['访客登记', '历史记录', 'sidecar 状态', '人工复核', '反馈闭环'],
  right: ['DeepSeek / OpenAI', 'AgentScope SDK', '企业增强 API', 'Qichacha/Tianyancha', 'Studio :3000'],
  groups: [
    { title: '接入与编排', tone: 'orange', nodes: ['VisitorAnalysisController', 'VerdictService', '任务进度广播', '降级兜底'] },
    { title: '确定性匹配', tone: 'green', nodes: ['Normalizer', 'CompetitorRepo', 'CustomerRepo', 'VisitorRepo'] },
    { title: '灰区智能判别', tone: 'purple', nodes: ['Python /analyze', 'enrich_company', 'classify JSON', 'AgentScope 接入点'] },
    { title: '裁决与存储', tone: 'cyan', nodes: ['枚举校验', '置信度 clamp', 'needsReview', 'VerdictRepo.insert'] },
  ],
  bottom: ['HTTP', 'SSE', 'OpenAI Compatible', 'AgentScope Trace', 'SQLite WAL', '人工反馈'],
  footer: 'VISITOR ANALYSIS',
}

const visitorStakeholderViews: StakeholderArchitectureViewsProps = {
  title: '面向不同角色的架构视图',
  summary: '先用业务语言讲清价值、能力和边界，再下钻到技术实现，避免一上来就进入 sidecar / SDK / trace 细节。',
  capabilities: [
    { title: '访客识别', items: ['客户', '竞品', '供应商'] },
    { title: '关系判断', items: ['新客', '熟客', '流失'] },
    { title: '规则定论', items: ['客户库命中', '竞品名单命中'] },
    { title: '灰区辅助', items: ['信息不足时 AI 提议', '人工复核'] },
    { title: '过程留痕', items: ['判别理由', '证据记录'] },
    { title: '持续改进', items: ['人工反馈', '名单维护'] },
  ],
  value: {
    center: '访客分析平台',
    top: '接待效率提升',
    left: '客户识别更快',
    right: '风险访客可控',
    bottom: '人工判断成本下降',
  },
  business: {
    actors: ['前台', '销售', '客户成功'],
    platform: '访客分析',
    capabilities: ['身份判别', '关系识别', '风险提示'],
    outcomes: ['减少误判', '提高跟进效率', '沉淀访客资产'],
  },
  layers: [
    { title: '业务应用层', items: ['访客登记', '接待台', '销售跟进'] },
    { title: '平台能力层', items: ['身份识别', '关系判断', '人工复核', '反馈闭环'] },
    { title: '数据与智能层', items: ['客户库', '竞品名单', '历史访客', 'AI 辅助判别'] },
  ],
  c4: [
    { level: 'Context', audience: '领导 / 老板', items: ['前台接待', '访客分析平台', '销售跟进'] },
    { level: 'Container', audience: '总监 / 架构师', items: ['前端页面', 'Java 服务', 'Python 边车', '数据存储'] },
    { level: 'Component', audience: '开发', items: ['判别编排', '规则匹配', '灰区判别', '代码裁决'] },
    { level: 'Code', audience: '程序员', items: ['VerdictService', 'MatchService', 'SidecarClient', 'server.py'] },
  ],
}

/* ──────────────────────────────────────────
   页面
────────────────────────────────────────── */

export function VisitorAnalysisArch() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">

      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserSearch className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">访客分析 · 实现原理</h1>
            <Badge variant="secondary">设计稿 v1</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/tools/visitor-analysis"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              <UserSearch className="h-3.5 w-3.5" /> 去分析
            </Link>
            <Link
              to="/tools/architecture"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          前台接待场景：访客登记时实时判别其身份（客户 / 竞品 / 供应商 / 求职者…）与关系（新客 / 熟客 / 流失）。
          核心原则是<b className="text-[var(--color-foreground)]">确定性优先（Deterministic-first）</b>——
          多数访客在规则层（客户库 + 竞品名单命中）就能定论，
          只有无法确定的"灰区"才交由 <b className="text-[var(--color-foreground)]">Python AgentScope sidecar</b> 做一次结构化 LLM 判别。
          LLM 输出只是"提议"，Java 端代码裁决（枚举校验 + 置信度阈值）后才落库。
        </p>
      </header>

      <StakeholderArchitectureViews {...visitorStakeholderViews} />

      <TechArchitectureMap {...visitorTechMap} />

      <Section
        icon={Network}
        title="一图看懂：组件能力与调用链"
        subtitle="从访客登记到最终结论，先走确定性规则；只有灰区才进入 Python sidecar 和 LLM；所有输出最后都由 Java 代码裁决"
      >
        <Card className="overflow-hidden border-[var(--color-primary)]/30">
          <CardHeader className="border-b bg-[var(--color-muted)]/25 pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span>端到端全景图</span>
              <Badge variant="outline">规则优先</Badge>
              <Badge variant="outline">灰区 LLM</Badge>
              <Badge variant="outline">代码裁决</Badge>
              <Badge variant="outline">监控旁路</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-4">
            <div className="grid gap-3 lg:grid-cols-5">
              {architectureLanes.map((lane, laneIndex) => {
                const style = toneStyles[lane.tone]
                return (
                  <div key={lane.label} className="relative">
                    <div className={cn('h-full rounded-xl border p-3 shadow-sm', style.lane)}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', style.badge)}>
                          {lane.label}
                        </span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {String(laneIndex + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {lane.nodes.map(node => (
                          <div key={node.name} className="rounded-lg border bg-[var(--color-card)] px-3 py-2">
                            <div className={cn('text-sm font-semibold', style.accent)}>{node.name}</div>
                            <div className="mt-1 text-xs leading-snug text-[var(--color-muted-foreground)]">
                              {node.detail}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {laneIndex < architectureLanes.length - 1 && (
                      <div className="hidden lg:block">
                        <div className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-[var(--color-background)] text-[var(--color-muted-foreground)]">
                          →
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1.15fr_1fr]">
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3">
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">规则快车道</div>
                <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                  <div className="rounded-lg border bg-[var(--color-card)] px-3 py-2">
                    竞品名单命中 → <b className="text-[var(--color-foreground)]">COMPETITOR · 0.99</b>
                  </div>
                  <div className="rounded-lg border bg-[var(--color-card)] px-3 py-2">
                    客户库命中 → <b className="text-[var(--color-foreground)]">EXISTING / CHURNED · 0.95</b>
                  </div>
                  <div>确定性事实命中时不调 LLM，降低成本，也避免模型重新解释事实。</div>
                </div>
              </div>

              <div className="rounded-xl border border-orange-500/35 bg-orange-500/5 p-3">
                <div className="text-sm font-semibold text-orange-700 dark:text-orange-300">灰区智能路径</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    ['SidecarClient', 'Java 只把无法确定的访客发给 Python'],
                    ['enrich_company', '补企业上下文；当前桩返回 degraded'],
                    ['classify', '一次结构化输出 identity / confidence / evidence'],
                  ].map(([title, detail]) => (
                    <div key={title} className="rounded-lg border bg-[var(--color-card)] px-3 py-2">
                      <div className="text-xs font-semibold">{title}</div>
                      <div className="mt-1 text-xs leading-snug text-[var(--color-muted-foreground)]">{detail}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-lg border border-dashed bg-[var(--color-card)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  AgentScope 接入后：模型调用 trace / token / cost 进入 <b className="text-[var(--color-foreground)]">Studio :3000</b>，
                  但业务结论仍回到 Java 裁决。
                </div>
              </div>

              <div className="rounded-xl border border-rose-500/35 bg-rose-500/5 p-3">
                <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">裁决与回写</div>
                <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                  <div className="rounded-lg border bg-[var(--color-card)] px-3 py-2">枚举非法 → UNKNOWN</div>
                  <div className="rounded-lg border bg-[var(--color-card)] px-3 py-2">置信度越界 → clamp(0, 1)</div>
                  <div className="rounded-lg border bg-[var(--color-card)] px-3 py-2">低置信 / UNKNOWN / degraded → needsReview</div>
                  <div>最终写入 verdict，前端读取并展示。</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">完整调用链 · 12 步</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {callChainSteps.map(step => {
                const style = toneStyles[step.tone]
                return (
                  <div key={`${step.no}-${step.title}`} className={cn('rounded-lg border p-3', style.lane)}>
                    <div className="flex items-start gap-2">
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold', style.badge)}>
                        {step.no}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{step.title}</div>
                        <div className="mt-1 text-xs leading-snug text-[var(--color-muted-foreground)]">{step.detail}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* ── 整体架构 ── */}
      <Section icon={Layers} title="整体架构" subtitle="两进程 + 一库：Java 主服务做编排/匹配/裁决；Python sidecar 专职灰区 LLM 判别；SQLite 持久化">
        <div className="space-y-2">
          {/* 前端 */}
          <div className="rounded-lg border border-l-4 border-l-blue-500 bg-blue-500/5 p-3">
            <span className="mb-2 inline-block rounded bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">前端 · React Feature</span>
            <div className="flex flex-wrap gap-2 text-sm">
              <div className="rounded-md border bg-[var(--color-card)] px-2.5 py-1.5">
                <div className="font-medium">VisitorAnalysisPage</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">输入表单 / 分析结果 / 历史记录表</div>
              </div>
              <div className="rounded-md border bg-[var(--color-muted)] px-2.5 py-1.5 text-xs">
                <div className="font-medium">sidecar 在线状态</div>
                <div className="text-[var(--color-muted-foreground)]">GET /sidecar-health 轮询</div>
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
              POST /api/visitor-analysis/analyze-sync（同步）· GET /api/visitor-analysis/verdicts
            </div>
          </div>

          <div className="flex items-center justify-center py-0.5 text-[var(--color-muted-foreground)] text-xs gap-1">↓ REST</div>

          {/* Java 主服务 */}
          <div className="rounded-lg border border-l-4 border-l-violet-500 bg-violet-500/5 p-3">
            <span className="mb-2 inline-block rounded bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-400">Java 主服务 · tool-visitor-analysis</span>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {/* 编排层 */}
              <div className="rounded-md border bg-[var(--color-card)] p-2.5 md:col-span-3">
                <div className="mb-1.5 text-xs font-semibold text-[var(--color-primary)]">VerdictService · 判别编排</div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {[
                    { n: '① 归一化', s: 'Normalizer' },
                    { n: '② 落访客记录', s: 'VisitorRepo.insert' },
                    { n: '③ 确定性匹配', s: 'MatchService' },
                  ].map((step, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="rounded border bg-[var(--color-muted)] px-2 py-0.5">
                        <span className="font-medium">{step.n}</span>
                        <span className="ml-1 text-[var(--color-muted-foreground)]">{step.s}</span>
                      </span>
                      <span className="text-[var(--color-muted-foreground)]">→</span>
                    </span>
                  ))}
                  <span className="rounded border border-dashed bg-orange-500/10 px-2 py-0.5 font-medium text-orange-700 dark:text-orange-400">
                    命中? ④规则定论 : ④灰区→sidecar
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">→</span>
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                    ⑤ 代码裁决 → 落库
                  </span>
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                  SSE 旁路：每步 emit("stage", step) → 前端实时进度；done/error 结束
                </div>
              </div>
              {/* MatchService */}
              <div className="rounded-md border bg-[var(--color-card)] p-2.5">
                <div className="mb-1 text-xs font-semibold">MatchService · 确定性匹配</div>
                <div className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <div>竞品优先：CompetitorRepo.matchName 命中即定，不再看客户库</div>
                  <div>客户库：CustomerRepo.findByPhoneOrCompany（双路）</div>
                  <div>历史来访：VisitorRepo.countPrior（补充上下文给 LLM）</div>
                  <div className="font-medium text-[var(--color-foreground)]">conclusive=true → 跳过 LLM</div>
                </div>
              </div>
              {/* SidecarClient */}
              <div className="rounded-md border bg-[var(--color-card)] p-2.5">
                <div className="mb-1 text-xs font-semibold">SidecarClient · HTTP</div>
                <div className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <div>POST {'{sidecarUrl}'}/analyze → SidecarVerdict</div>
                  <div>超时 / 5xx → null（不抛异常）</div>
                  <div className="font-medium text-[var(--color-foreground)]">null → 降级 UNKNOWN + needsReview</div>
                </div>
              </div>
              {/* 代码裁决 */}
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5">
                <div className="mb-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">代码裁决（系统真相）</div>
                <div className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <div>IdentityType.parse → 非法枚举 → UNKNOWN</div>
                  <div>clamp(0, 1) → 置信度越界 → 0</div>
                  <div>confidence &lt; threshold → needsReview=true</div>
                  <div>identity=UNKNOWN → needsReview=true</div>
                  <div>degraded=true → needsReview=true</div>
                </div>
              </div>
            </div>
          </div>

          {/* 双向箭头 */}
          <div className="grid grid-cols-2 gap-2 text-center text-[10px] text-[var(--color-muted-foreground)]">
            <div></div>
            <div className="flex items-center justify-center gap-1">↓ POST /analyze &nbsp; ↑ SidecarVerdict</div>
          </div>

          {/* Python sidecar + SQLite 并排 */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-l-4 border-l-orange-500 bg-orange-500/5 p-3">
              <span className="mb-2 inline-block rounded bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400">Python AgentScope Sidecar · FastAPI</span>
              <div className="space-y-1.5 text-xs">
                <div className="rounded-md border bg-[var(--color-card)] px-2.5 py-1.5">
                  <div className="font-medium">enrich_company()</div>
                  <div className="text-[var(--color-muted-foreground)]">企业数据增强（当前为模拟桩，降级 degraded=True）</div>
                  <div className="text-[var(--color-muted-foreground)]">真实接入：企查查/天眼查适配器，签名不变</div>
                </div>
                <div className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-2.5 py-1.5">
                  <div className="font-medium">classify() · 结构化输出</div>
                  <div className="text-[var(--color-muted-foreground)]">System Prompt 枚举约束 + json_object 格式</div>
                  <div className="text-[var(--color-muted-foreground)]">_classify_with_agentscope（占位）→ fallback →</div>
                  <div className="text-[var(--color-muted-foreground)]">_classify_openai_compatible（OpenAI SDK）</div>
                </div>
                <div className="rounded-md border border-dashed px-2.5 py-1.5 opacity-60">
                  <div className="font-medium">AgentScope 集成点（学习目标）</div>
                  <div className="text-[var(--color-muted-foreground)]">_classify_with_agentscope：接 AgentScope 模型层</div>
                  <div className="text-[var(--color-muted-foreground)]">→ Studio token/cost/trace 自动可视化</div>
                </div>
                <div className="text-[10px] text-[var(--color-muted-foreground)]">
                  端口 VA_PORT（默认 9600）· key 走环境变量 VA_LLM_API_KEY
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-l-4 border-l-rose-500 bg-rose-500/5 p-3">
              <span className="mb-2 inline-block rounded bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">持久化 · SQLite</span>
              <div className="space-y-1.5 text-xs">
                {[
                  { t: 'visitor', s: '原始输入 + 归一化字段（phoneNorm, companyNorm）' },
                  { t: 'verdict', s: 'identity / relationship / confidence / decidedBy\nrationale / evidence / model / needsReview' },
                  { t: 'customer', s: '客户参考库（手机 + 公司名 + status + lastDealAt）' },
                  { t: 'competitor', s: '竞品公司名单（归一化后 LIKE 匹配）' },
                  { t: 'feedback', s: '人工纠错记录（预留，用于数据闭环）' },
                ].map(r => (
                  <div key={r.t} className="flex gap-2">
                    <code className="shrink-0 rounded border bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px]">{r.t}</code>
                    <span className="text-[var(--color-muted-foreground)] text-[11px] leading-snug">{r.s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 两条判别路径 ── */}
      <Section
        icon={GitBranch}
        title="两条判别路径"
        subtitle="命中规则层（多数）直接定论，不消耗 LLM；只有灰区才调 sidecar，且输出一律经代码裁决"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 规则路径 */}
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                规则路径（高置信，无 LLM）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <HFlow steps={[
                { title: '归一化公司名命中竞品名单', tone: 'danger' },
                { title: 'COMPETITOR · 0.99 · 定论', tone: 'accent' },
              ]} />
              <HFlow steps={[
                { title: '手机/公司名命中客户库', tone: 'primary' },
                { title: 'CUSTOMER · status/lastDealAt', tone: 'muted' },
                { title: 'EXISTING/CHURNED · 0.95 · 定论', tone: 'accent' },
              ]} />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                <b className="text-[var(--color-foreground)]">竞品优先：</b>
                hitCompetitor=true 时直接 COMPETITOR，不再查客户库（防止竞品以"老客户"身份混入）。
                流失判定：lastDealAt 超过 365 天 or status='churned' → CHURNED。
              </p>
            </CardContent>
          </Card>

          {/* LLM 路径 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-[var(--color-primary)]" />
                灰区路径（sidecar LLM 判别）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <VFlow steps={[
                { title: '两库均未命中（灰区）', tone: 'muted' },
                { title: 'enrich_company() → 企业增强数据（含 degraded 标记）', tone: 'muted' },
                { title: 'LLM 一次结构化输出 → SidecarVerdict（提议）', tone: 'primary' },
                { title: '代码裁决：枚举校验 + clamp + threshold → 落库', tone: 'accent' },
              ]} />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                <b className="text-[var(--color-foreground)]">关键约束：</b>
                System Prompt 明确告知"是否老客户由客户库决定，不在你的判断范围"——切断 LLM 幻觉路径。
                任何 LLM 输出视为不可信入参，代码归一化后才落库。
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ── Python Sidecar 实现 ── */}
      <Section
        icon={Plug}
        title="Python AgentScope Sidecar · 实现细节"
        subtitle="职责边界：只接灰区 · 只做增强+分类 · 输出只是提议。AgentScope 连接点留占位，OpenAI SDK 为当前运行路径"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">为什么单次结构化输出而非 ReAct 循环</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-[var(--color-muted-foreground)]">
                <p>所有确定性步骤（归一化/查库/增强）已在代码里按固定顺序完成，模型不需要自己决定"下一步查什么"——这是 deterministic-first 的直接推论：确定性的步骤永远不该交给概率性的工具路由。</p>
                <p>模型只做最后一步：拿到字段+增强数据，输出一个枚举+理由。结构稳、延迟确定、不依赖模型的 function-calling 能力（第三方平台支持参差不齐）。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">AgentScope 集成路径（当前状态）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-[var(--color-muted-foreground)]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">占位</span>
                    <span><code>_classify_with_agentscope()</code> → 抛 NotImplementedError</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">运行中</span>
                    <span>fallback → <code>_classify_openai_compatible()</code>（openai SDK）</span>
                  </div>
                </div>
                <p className="pt-1">
                  接入 AgentScope 后：在 <code>_classify_with_agentscope</code> 里换用 AgentScope 的模型层调用，
                  并 <code>agentscope.init(studio_url='http://localhost:3000')</code>——
                  token/cost/trace 就会自动出现在 Studio，无需改其他代码。
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-3">
            <CodeBlock
              title="分类主流程（Python · server.py）"
              lang="Python"
              code={[
                'def classify(payload: dict) -> dict:',
                '    company = payload.get("company") or ""',
                '    enrichment = enrich_company(company)    # 企业增强（当前为桩）',
                '    degraded = bool(enrichment.get("degraded"))',
                '',
                '    if not LLM_API_KEY:                      # key 未配：不瞎判',
                '        return {"identity":"UNKNOWN", "confidence":0.0,',
                '                "degraded":True, ...}',
                '',
                '    try:',
                '        data = _classify_with_agentscope(payload, enrichment)',
                '    except NotImplementedError:              # 占位未实现 → 回落',
                '        data = _classify_openai_compatible(payload, enrichment)',
                '',
                '    # ── 归一化兜底（代码裁决在 Python 侧第一道） ──',
                '    identity = (data.get("identity") or "UNKNOWN").upper()',
                '    if identity not in IDENTITIES: identity = "UNKNOWN"',
                '    confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))',
                '    # ── 最终裁决仍在 Java 端（枚举校验 + 阈值判断） ──',
                '    return { "identity":identity, "confidence":confidence,',
                '             "rationale":..., "evidence":[...], "degraded":degraded }',
              ].join('\n')}
            />
            <CodeBlock
              title="Java 代码裁决（VerdictService.decideByLlm）"
              lang="Java"
              code={[
                '// —— 代码裁决：LLM 输出当不可信入参 ——',
                'IdentityType identity = IdentityType.parse(proposal.identity());',
                '// parse() 内部：非法枚举值 → UNKNOWN，不抛异常',
                '',
                'RelationshipType rel = identity == IdentityType.CUSTOMER',
                '    ? RelationshipType.parse(proposal.relationship())',
                '    : RelationshipType.NONE;  // 非客户关系无意义，强制 NONE',
                '',
                'double confidence = clamp(proposal.confidence()); // Math.min(1,max(0,v))',
                '',
                'boolean needsReview = confidence < props.getReviewThreshold()',
                '    || identity == IdentityType.UNKNOWN',
                '    || proposal.degraded();   // 企业增强降级时也标待复核',
                '',
                '// 落库，decidedBy="llm" 方便后续分析 AI vs 规则的准确率',
                'verdictRepo.insert(visitorId, identity.name(), rel.name(),',
                '    confidence, "llm", rationale, evidence, model, needsReview);',
              ].join('\n')}
            />
          </div>
        </div>
      </Section>

      {/* ── 确定性优先 ── */}
      <Section
        icon={Scale}
        title="确定性优先 · 各步骤的谁来做"
        subtitle="能用代码稳定算/查/校验的就不给 LLM；LLM 只承担真正无法穷举规则的模糊理解"
      >
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                  <th className="px-4 py-3 font-medium">步骤 / 任务</th>
                  <th className="px-4 py-3 font-medium">谁来做</th>
                  <th className="px-4 py-3 font-medium">为什么</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { task: '手机号归一化（+86/空格/短横线）', who: '代码', why: 'Normalizer 正则，确定性规则，LLM 做这个是浪费且不稳', wc: 'code' },
                  { task: '公司名归一化（去"有限公司/集团"）', who: '代码', why: '词表穷举，字符串处理；命中即精确匹配', wc: 'code' },
                  { task: '客户/竞品库精确匹配', who: '代码', why: 'SQL WHERE · 确定性事实，命中即定论', wc: 'code' },
                  { task: '流失判定（365天/status字段）', who: '代码', why: '时间算术 + 枚举状态机，确定性逻辑', wc: 'code' },
                  { task: '枚举值校验（identity/relationship）', who: '代码', why: 'parse() 归一化：越界 → 安全默认；永不信 LLM 字符串', wc: 'code' },
                  { task: '置信度范围约束', who: '代码', why: 'clamp(0,1)；LLM 的"自信度"是感觉，代码兜底', wc: 'code' },
                  { task: '身份类型判断（灰区访客）', who: 'LLM', why: '无法穷举规则：公司名暗示、来访目的理解、行业判断——这是 LLM 的强项', wc: 'llm' },
                  { task: '来访目的语义理解', who: 'LLM', why: '"聊合作"=合作伙伴 vs "了解产品"=可能客户——模糊语义', wc: 'llm' },
                  { task: '提议置信度', who: 'LLM', why: '对自身判断的不确定度，但代码 clamp + threshold 兜底', wc: 'llm-guarded' },
                  { task: 'needsReview 最终判定', who: '代码', why: '三条独立触发路径（低置信/UNKNOWN/降级），代码精确控制', wc: 'code' },
                ].map(r => (
                  <tr key={r.task} className="border-b align-top last:border-0">
                    <td className="px-4 py-3 font-medium">{r.task}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                        r.wc === 'code' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                        r.wc === 'llm' && 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
                        r.wc === 'llm-guarded' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                      )}>
                        {r.who}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>

      {/* ── 选型决策 ── */}
      <Section
        icon={Boxes}
        title="关键选型决策"
        subtitle="每个决策列出：✓ 选用 · 降级备选 · ✗ 被筛除项（置灰 + 原因）"
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* ── 健壮性 ── */}
      <Section
        icon={ShieldCheck}
        title="健壮性（抗造）清单"
        subtitle="七个防御点，覆盖 LLM 幻觉、服务不可用、数据越界、业务优先级冲突"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {guards.map(g => <GuardCard key={g.tag} {...g} />)}
        </div>
      </Section>

      {/* ── 数据模型 ── */}
      <Section
        icon={Database}
        title="数据模型快览"
        subtitle="五张表：visitor（原始）· verdict（判别结论）· customer/competitor（参考库）· feedback（闭环）"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <CodeBlock
            title="verdict（判别结论表）"
            lang="SQL"
            code={[
              'CREATE TABLE IF NOT EXISTS visitor_verdict (',
              '  id           INTEGER PRIMARY KEY AUTOINCREMENT,',
              '  visitor_id   INTEGER NOT NULL,',
              '  identity     TEXT NOT NULL,   -- IdentityType 枚举名',
              '  relationship TEXT NOT NULL,   -- RelationshipType 枚举名',
              '  confidence   REAL NOT NULL DEFAULT 0,',
              '  decided_by   TEXT NOT NULL,   -- rule:customer/rule:competitor/llm/degraded',
              '  rationale    TEXT,            -- LLM 给的一句话理由（规则路径为 NULL）',
              '  evidence     TEXT,            -- JSON 字符串数组',
              '  model        TEXT,            -- LLM 模型名（规则路径为 NULL）',
              '  needs_review INTEGER NOT NULL DEFAULT 0,',
              '  created_at   INTEGER NOT NULL',
              ');',
            ].join('\n')}
          />
          <CodeBlock
            title="visitor（访客原始输入表）"
            lang="SQL"
            code={[
              'CREATE TABLE IF NOT EXISTS visitor (',
              '  id           INTEGER PRIMARY KEY AUTOINCREMENT,',
              '  name         TEXT,',
              '  phone        TEXT,',
              '  phone_norm   TEXT,  -- 归一化后，用于匹配',
              '  company      TEXT,',
              '  company_norm TEXT,  -- 归一化后，用于匹配',
              '  company_addr TEXT,',
              '  email        TEXT,',
              '  purpose      TEXT,',
              '  source       TEXT,  -- web/api',
              '  created_at   INTEGER NOT NULL',
              ');',
            ].join('\n')}
          />
        </div>
      </Section>

      {/* ── 实测状态 ── */}
      <Section icon={CheckCircle2} title="当前状态 · 已做 / 待做">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-emerald-500/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> 已实现
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <li>• 完整判别流水线：归一化 → 确定性匹配 → 规则/LLM 两路 → 代码裁决 → 落库</li>
                <li>• Python FastAPI sidecar：健康检查 / classify 接口 / OpenAI 兼容调用</li>
                <li>• 代码裁决全部防御点（枚举校验 / clamp / degraded / threshold）</li>
                <li>• sidecar 不可用自动降级（UNKNOWN + needsReview）</li>
                <li>• 前端：表单 / 判别结果 / 历史记录 / sidecar 在线状态提示</li>
                <li>• decidedBy 字段区分 rule:* / llm / degraded，便于后续准确率分析</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> 待做 / 可扩展
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <li>• AgentScope 正式接入（_classify_with_agentscope 实现）+ Studio token/trace 可视化</li>
                <li>• 企业数据增强：企查查/天眼查适配器替换模拟桩（签名已稳定）</li>
                <li>• feedback 表：人工纠错 → 数据闭环（用于评估 LLM vs 规则的准确率）</li>
                <li>• 批量导入客户库 / 竞品名单的管理 UI</li>
                <li>• 异步判别 + SSE 进度（VerdictService.analyze 已支持 taskId，前端待对接）</li>
                <li>• needsReview 待人工确认队列页面</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

    </div>
  )
}

import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideProps } from 'lucide-react'
import {
  ArrowRight,
  ArrowDown,
  BrainCircuit,
  Bot,
  Wrench,
  Database,
  Radio,
  Layers,
  Server,
  Cpu,
  ShieldCheck,
  Repeat,
  MessageSquareText,
  Tag,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  Network,
  ListTree,
  XCircle,
  LifeBuoy,
  Scale,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Icon = ComponentType<LucideProps>

/* ------------------------------------------------------------------ */
/* 通用小组件                                                          */
/* ------------------------------------------------------------------ */

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: Icon
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

function FlowBox({
  icon: Icon,
  title,
  desc,
  tone = 'default',
  className,
}: {
  icon?: Icon
  title: string
  desc?: string
  tone?: 'default' | 'primary' | 'muted' | 'accent'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'border bg-[var(--color-card)]',
    primary:
      'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-card-foreground)]',
    muted: 'border bg-[var(--color-muted)]',
    accent: 'border-emerald-500/40 bg-emerald-500/10',
  }
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-3 py-2.5 text-center',
        tones[tone],
        className
      )}
    >
      <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{title}</span>
      </div>
      {desc && (
        <div className="text-xs leading-snug text-[var(--color-muted-foreground)]">{desc}</div>
      )}
    </div>
  )
}

/** 横向流程：步骤之间插入箭头，移动端自动换行并改为向下箭头 */
function HFlow({ steps }: { steps: { icon?: Icon; title: string; desc?: string; tone?: 'default' | 'primary' | 'muted' | 'accent' }[] }) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {steps.map((s, i) => (
        <div key={i} className="contents">
          <FlowBox {...s} />
          {i < steps.length - 1 && (
            <>
              <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] sm:block" />
              <ArrowDown className="mx-auto block h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] sm:hidden" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

type Opt = { name: string; reason: string }
type Decision = { topic: string; chosen: Opt; fallback?: Opt; rejected: Opt[] }

/** 一个选型决策：选用高亮、降级备选次之、被筛除项置灰 + 原因 */
function DecisionCard({ d }: { d: Decision }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{d.topic}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 选用 */}
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{d.chosen.name}</span>
              <Badge variant="success">选用</Badge>
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">{d.chosen.reason}</div>
          </div>
        </div>

        {/* 降级备选 */}
        {d.fallback && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{d.fallback.name}</span>
                <Badge variant="outline">降级备选</Badge>
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">{d.fallback.reason}</div>
            </div>
          </div>
        )}

        {/* 被筛除（置灰） */}
        {d.rejected.map(r => (
          <div
            key={r.name}
            className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 opacity-55"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-muted-foreground)] line-through">
                  {r.name}
                </span>
                <Badge variant="outline" className="text-[var(--color-muted-foreground)]">
                  筛除
                </Badge>
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">✗ {r.reason}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 数据                                                                */
/* ------------------------------------------------------------------ */

const knowledgeMap: { icon: Icon; block: string; here: string; note?: string }[] = [
  { icon: Cpu, block: '大脑 Brain', here: '本地 Qwen2.5-7B', note: '推理 / 决策下一步' },
  { icon: Repeat, block: '循环 Loop', here: 'LangChain4j AiServices', note: '自动跑 思考→调工具→回喂' },
  { icon: Wrench, block: '工具 Tools', here: '@Tool 方法', note: '查记录 / 算开销 / 列待办 / 标完成' },
  { icon: Database, block: '记忆 Memory', here: '短期窗口 + SQLite', note: 'ChatMemory + 长期落库' },
  { icon: ListTree, block: '规划 Planning', here: '暂不做', note: '单 agent 直接编排，留扩展位' },
  { icon: MessageSquareText, block: '角色 Prompt', here: 'System Prompt', note: '注入身份 + 当前时间 + 类目枚举' },
]

const decisions: Decision[] = [
  {
    topic: 'Agent 框架',
    chosen: {
      name: 'LangChain4j',
      reason: '生态广、AiServices/tool/memory 抽象贴 agent、学习资料多；手动接 Spring 对学习反而是加分',
    },
    rejected: [
      {
        name: 'Spring AI',
        reason: '集成最顺，但 1.0 起步晚、生态与集成广度仍在追赶，agent 抽象不如 LangChain4j 原生、学习资料偏少',
      },
      {
        name: 'Spring AI + LangChain4j 混用',
        reason: '职责高度重叠：双客户端 / 双配置 / 双心智模型，学习被搅浑且零收益',
      },
    ],
  },
  {
    topic: 'LLM 模型',
    chosen: {
      name: 'Qwen2.5-7B-Instruct',
      reason: '中文母语级 + 原生 function calling；4.7GB，已实测 tool calling 与结构化输出通过',
    },
    fallback: { name: 'Qwen2.5-3B', reason: '7B 跑不动时的降级退路，记录态够用' },
    rejected: [
      {
        name: 'Gemma3n-E4B（gemma4:e4b）',
        reason: '中文偏弱、原生工具调用弱，且体积最大（9.6GB）',
      },
      { name: 'translategemma:4b', reason: '翻译专用模型，非通用指令 / 工具调用' },
      { name: 'llama3.2:3b', reason: '中文能力弱，不适合中文为主的个人秘书' },
    ],
  },
  {
    topic: 'LLM 运行时',
    chosen: { name: 'Ollama（本地）', reason: '零成本 + 隐私：私人笔记不出本机' },
    fallback: {
      name: '云端 OpenAI 兼容网关',
      reason: '回忆态多步编排小模型不稳时的升档路径（接口同构，仅改配置）',
    },
    rejected: [],
  },
  {
    topic: 'LLM 接口协议',
    chosen: {
      name: 'OpenAI 兼容 /v1',
      reason: '一套抽象本地 / 云端通用，换模型只改 application.yml',
    },
    rejected: [
      { name: '原生 Ollama API（OllamaChatModel）', reason: '绑死 Ollama，后续切云端需改代码' },
    ],
  },
  {
    topic: '模型管理 / 路由',
    chosen: {
      name: 'toolbox-llm 进程内路由器',
      reason: '共享模块：模型池 + 分级(tier)路由 + 权重分发 + 429 熔断故障转移；RoutingChatModel 对 AiServices 透明',
    },
    rejected: [
      { name: '无路由 · 直连单模型', reason: '联网 API 限流/宕机无降级、单点；同平台多 key 也无法分摊' },
      { name: 'LiteLLM 等外置网关', reason: '单用户本地多一个常驻进程/部署，过重；进程内路由已够用' },
      { name: '塞进 Spring AI 共享', reason: 'ai-secretary 已选 LangChain4j，跨框架无法共享同一模型对象' },
    ],
  },
  {
    topic: '结构化输出',
    chosen: {
      name: 'JSON Schema 约束解码',
      reason: '服务层锁死合法 JSON，小模型也稳，兜住“乱答”',
    },
    rejected: [{ name: '纯 prompt 约束', reason: '不强制，小模型仍会跑偏，可靠性不足' }],
  },
  {
    topic: '实时进度推送',
    chosen: {
      name: 'SSE（SseEmitterRegistry）',
      reason: '单向推送够用、仓库现成；把 agent 每步推前端可视化',
    },
    rejected: [
      { name: 'WebSocket', reason: '双向通道，这里只需服务端 → 前端单向推送，过重' },
      { name: '轮询 Polling', reason: '延迟高 + 空轮询浪费，体验差' },
    ],
  },
  {
    topic: '持久化',
    chosen: {
      name: 'SQLite（Spring JDBC）',
      reason: '单用户本地；顺 kai-toolbox 约定，每 tool 独立 schema',
    },
    rejected: [
      { name: 'PostgreSQL / MySQL', reason: '单用户本地场景，外置 DB 属过度基础设施（架构文档明确排除）' },
      { name: '向量库 / RAG', reason: '当前按结构化字段查询即可，暂不需要语义检索；留扩展位' },
    ],
  },
]

/** 纯顺栈、无横向对比的选择 */
const stackOnly =
  'Spring Boot 3.4 · React 19 + Vite + Tailwind v4 —— 沿用 kai-toolbox 既有外壳，无横向对比'

const robustness: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '一句话夹好几件事', guard: '强制输出 items[] 数组（schema 约束）' },
  { tag: '②', risk: '分类拿不准', guard: 'confidence 字段 + 阈值路由“待复核”' },
  { tag: '③', risk: '模型 JSON 乱答', guard: 'JSON Schema 约束 + 解析失败重试 → 降级为纯笔记' },
  { tag: '④', risk: '“明天/下周三”相对时间', guard: 'System Prompt 注入当前时间 {now}' },
  { tag: '⑤', risk: '回忆态死循环', guard: 'max steps 上限，超了用现有信息作答' },
  { tag: '⑥', risk: '工具(SQL)报错', guard: '异常回喂模型让它纠正，而非整体崩溃' },
  { tag: '⑦', risk: '全程不可观测', guard: 'ChatModelListener 记录每轮 + SSE 流式推前端' },
]

const toolCallingNotes: { icon: Icon; title: string; detail: string }[] = [
  {
    icon: MessageSquareText,
    title: 'description 是运行时路由依据',
    detail: '模型靠它决定调哪个工具——写烂=选错。它是 load-bearing，不是给人看的注释',
  },
  {
    icon: Boxes,
    title: '全部工具每轮重发给模型',
    detail: 'tools schema 随每次请求带上，token 随工具数涨；工具集要小而精，几十个以上才上 tool-RAG 预筛',
  },
  {
    icon: Network,
    title: '模型本身就是路由器',
    detail: '没有独立分类器，识别=模型一次推理，故路由是概率性的、可能选错',
  },
  {
    icon: ShieldCheck,
    title: 'LLM 填的参数当不可信输入',
    detail: '收到即校验 / 归一化（同 CaptureNormalizer 思路），不直接信',
  },
  {
    icon: Repeat,
    title: 'max steps 兜底',
    detail: '调用方是 LLM，可能死循环 / 抽风；普通接口不需要这层防护',
  },
  {
    icon: Wrench,
    title: '已标准化为 MCP',
    detail: 'tool = 接口契约的跨进程标准；本仓 tool-resume 即一个 MCP server',
  },
]

const deterministicSplit: { task: string; who: string; how: string }[] = [
  { task: '相对时间 / 时区', who: '代码', how: 'TimeRangeResolver + nowContext 注入；dueTime 落库前 parse 校验' },
  { task: '金额抽取', who: '代码兜底', how: '正则 extractAmount，LLM 漏抽时补、可交叉校验' },
  { task: '检索 / 聚合', who: '代码', how: 'searchNotes / aggregateExpense 背后全是确定性 SQL' },
  { task: '分类 / 意图理解', who: 'LLM', how: '模糊判断；配 confidence + 低置信待复核' },
  { task: '工具路由（选哪个）', who: 'LLM', how: '读 @Tool description 决策（概率性）' },
]

const agentLadder: { level: string; name: string; note: string; here: boolean }[] = [
  { level: 'L0', name: '单次 LLM 调用，无工具', note: '记录态', here: true },
  { level: 'L1', name: '单步工具路由（意图 → 选 1 个工具 → 答）', note: '回忆态·多数', here: true },
  { level: 'L2', name: '多步工具循环 ReAct（看结果再决定）', note: '回忆态·复杂', here: true },
  { level: 'L3', name: '规划 / 反思 / 自主分解', note: 'YAGNI', here: false },
  { level: 'L4', name: '多 agent 协作', note: '不需要', here: false },
]

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">AI 秘书 · 架构总览</h1>
            <Badge variant="secondary">设计稿 v1</Badge>
          </div>
          <Link
            to="/tools/ai-secretary"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <Network className="h-3.5 w-3.5" /> 去记录
          </Link>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          一个跑在本地的个人助理 Agent：随手把杂事/笔记丢进去，自动
          <b className="text-[var(--color-foreground)]">分类 + 抽结构 + 存库</b>（记录态），之后用
          <b className="text-[var(--color-foreground)]">自然语言问回来</b>（回忆态）。
          技术栈 LangChain4j + 本地 Ollama/Qwen，作为 kai-toolbox 的一个 tool 模块。
        </p>
        <p className="max-w-3xl text-xs text-[var(--color-muted-foreground)]">
          注：本仓已有的纯前端 <code className="rounded bg-[var(--color-muted)] px-1">secretary（个人秘书）</code>
          是 IndexedDB 随手记，无 AI；本 feature 是它的服务端 AI 增强版，架构不同，独立成模块。
        </p>
      </header>

      {/* 分层架构 */}
      <Section icon={Layers} title="分层架构" subtitle="请求从前端进，落到本地模型与 SQLite；SSE 作旁路把每步推回前端">
        <Card>
          <CardContent className="space-y-2 p-4">
            <FlowBox
              icon={Network}
              title="前端 · React Feature（ai-secretary）"
              desc="输入框 / 时间轴 / 回忆问答 / 本架构页"
              tone="primary"
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <FlowBox
              icon={Server}
              title="API · AssistantController"
              desc="POST /capture · POST /ask · GET /notes · SSE /stream"
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <HFlow
              steps={[
                { icon: Tag, title: 'CaptureService', desc: '记录态：分类 + 抽字段' },
                { icon: BrainCircuit, title: 'RecallService', desc: '回忆态：工具编排' },
              ]}
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <FlowBox
              icon={Boxes}
              title="LangChain4j（AiServices + @Tool + ChatMemory）"
              desc="向网关取 ChatModel，自身不持有具体模型"
              tone="muted"
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <FlowBox
              icon={Network}
              title="toolbox-llm 模型网关（ChatModelRouter）"
              desc="按 tier 分级 · 权重分发 · 429 熔断 · 故障转移（RoutingChatModel 对上透明）"
              tone="primary"
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <HFlow
              steps={[
                { icon: Cpu, title: '模型池 · 本地 Ollama / 远端 API', desc: 'OpenAI 兼容，互为故障转移与限流分摊', tone: 'accent' },
                { icon: Database, title: 'SQLite（ai-secretary-schema）', desc: '记录持久化' },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      {/* 两种模式 */}
      <Section icon={Repeat} title="两种模式 = 两条数据流" subtitle="记录态练“结构化输出+校验”，回忆态练“Agent Loop+工具编排”">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-[var(--color-primary)]" />
                记录态 Capture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <HFlow
                steps={[
                  { title: '用户随手输入' },
                  { title: 'System 注入 now + 类目枚举', tone: 'muted' },
                  { title: 'Qwen 结构化输出 items[]', tone: 'primary' },
                  { title: '校验 / 失败降级' },
                  { title: '存 SQLite → 时间轴' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4 text-[var(--color-primary)]" />
                回忆态 Recall（Agent Loop）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <HFlow
                steps={[
                  { title: '自然语言提问' },
                  { title: 'Qwen 思考：调哪个工具', tone: 'primary' },
                  { title: '执行 @Tool（查 SQL）' },
                  { title: '结果回喂模型' },
                  { title: '多步循环 → 作答', tone: 'accent' },
                ]}
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                ↑ 中间“思考→调工具→回喂”由 LangChain4j 自动循环；每一步经 SSE 实时推到前端，可视化 agent 推理。
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Tool Calling 机制 · 开发要点 */}
      <Section
        icon={Wrench}
        title="Tool Calling 机制 · 开发要点"
        subtitle="工具 = 接口契约（schema=接口定义 · tool_calls=请求 · 工具结果=响应），但调用方是 LLM（概率性），故多三层防护"
      >
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow
              steps={[
                { icon: MessageSquareText, title: '对话 + 全部工具 schema' },
                { icon: Cpu, title: '模型识别 + 决策', tone: 'primary' },
                { icon: Wrench, title: '出 tool_calls → 代码执行' },
                { icon: Repeat, title: '结果回喂 → 再推理', tone: 'accent' },
              ]}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              模型不再要求调工具时 → 直接出最终答案，循环结束。「调哪个工具」没有独立分类器，就是模型读
              <b className="text-[var(--color-foreground)]"> [对话 + 全部工具 schema] </b>的一次推理。
            </p>
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {toolCallingNotes.map(n => (
            <Card key={n.title}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-primary)]">
                  <n.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{n.detail}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* 知识体系映射 */}
      <Section icon={BrainCircuit} title="Agent 知识体系 → 本项目落点" subtitle="六块拼图各自映射到具体技术">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {knowledgeMap.map(k => (
            <Card key={k.block}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-primary)]">
                  <k.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{k.block}</div>
                  <div className="text-sm text-[var(--color-foreground)]">{k.here}</div>
                  {k.note && (
                    <div className="text-xs text-[var(--color-muted-foreground)]">{k.note}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* Agent 能力谱系 */}
      <Section
        icon={ListTree}
        title="Agent 能力谱系 · 本项目定位"
        subtitle="“更 agent”不等于“更好”——本项目刻意停在 L2，把确定性留给代码"
      >
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {agentLadder.map(a => (
                  <tr key={a.level} className={cn('border-b last:border-0', a.here && 'bg-[var(--color-primary)]/5')}>
                    <td className="px-4 py-3 font-mono font-medium">{a.level}</td>
                    <td className="px-4 py-3">{a.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {a.here ? (
                        <Badge variant="success">{a.note}</Badge>
                      ) : (
                        <span className="text-xs text-[var(--color-muted-foreground)]">{a.note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>

      {/* 模型网关 / 路由 */}
      <Section
        icon={Network}
        title="模型网关 / 路由（toolbox-llm）"
        subtitle="联网 API 限流/宕机时，同档位池内按权重分摊 + 故障转移；对 AiServices 透明"
      >
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow
              steps={[
                { icon: Boxes, title: 'AiServices', desc: '只认一个 ChatModel' },
                { icon: Network, title: 'RoutingChatModel', desc: '按 tier 取池 + 路由', tone: 'primary' },
              ]}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <FlowBox icon={Cpu} title="本地 qwen2.5-7b（weight 1）" desc="tier=capture · 零成本 / 隐私" tone="accent" />
              <FlowBox icon={Cpu} title="远端 deepseek（weight 2）" desc="tier=recall · 强模型 / 互为故障转移" tone="muted" />
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              每次调用按权重选主成员；429 / 报错 → 熔断该成员 cooldown 秒并转移到下一个；同平台多 key / 多模型当带权池分摊限流。配置在 <code>toolbox.llm.models</code>。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 中间件选型 */}
      <Section
        icon={Boxes}
        title="中间件 / 技术选型"
        subtitle="每个决策列出：✓ 选用 · 降级备选 · ✗ 被筛除项（置灰 + 原因）"
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => (
            <DecisionCard key={d.topic} d={d} />
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">{stackOnly}</p>
      </Section>

      {/* 确定性优先 */}
      <Section
        icon={Scale}
        title="确定性优先（Deterministic-first，LLM-last）"
        subtitle="能用代码稳定算/查/校验的就别给 LLM；LLM 只做模糊理解，输出当不可信入参由代码裁决"
      >
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--color-muted-foreground)]">
                  <th className="px-4 py-3 font-medium">任务</th>
                  <th className="px-4 py-3 font-medium">谁来做</th>
                  <th className="px-4 py-3 font-medium">怎么做</th>
                </tr>
              </thead>
              <tbody>
                {deterministicSplit.map(d => (
                  <tr key={d.task} className="border-b align-top last:border-0">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{d.task}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                          d.who === '代码' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                          d.who === '代码兜底' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                          d.who === 'LLM' && 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                        )}
                      >
                        {d.who}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{d.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
          何时值得加代码护栏：<b className="text-[var(--color-foreground)]">后果大 × LLM 爱错 × 校验便宜</b>{' '}
          三者相乘——三高才上（时间、金额）；语义判断这类难穷举规则的，留给 LLM。一句话：<b className="text-[var(--color-foreground)]">LLM 提议，代码裁决</b>。
        </p>
        <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
          <CardContent className="space-y-1.5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Scale className="h-4 w-4 text-[var(--color-primary)]" /> 推论：枚举「输出」，不穷举「输入」
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              模糊词 → 结构化值时，定义一个<b className="text-[var(--color-foreground)]">封闭的输出词表（枚举）</b>，
              让 LLM 把无限说法归到桶里（它的强项、零代码维护），代码只在有限桶上做确定性计算——新说法不必改代码。
              反例：用 <code>contains</code> 匹配中文说法 = 穷举无限输入 → 打地鼠。
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              本仓已落地：<code>NoteCategory</code>（类目）、<code>TimeBucket</code>（时间范围，10 个桶）——
              LangChain4j 把枚举值写进工具 schema，模型只能从中选一个，「最近 / 前阵子」自动归到 <code>LAST_7_DAYS</code>。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 抗造清单 */}
      <Section icon={ShieldCheck} title="健壮性（抗造）清单 → 落点" subtitle="光跑通 demo 看不出来，真数据一上才现形">
        <div className="grid gap-3 sm:grid-cols-2">
          {robustness.map(r => (
            <Card key={r.tag}>
              <CardContent className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-semibold text-[var(--color-primary)]">
                  {r.tag}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.risk}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{r.guard}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* 实测结论 */}
      <Section icon={CheckCircle2} title="本地实测结论" subtitle="2026-06-10 · 本机 ollama qwen2.5:7b-instruct · OpenAI 兼容端点">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-emerald-500/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> 已验证通过
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <li>• 端到端：:18099 → AiServices 经 <code>RoutingChatModel</code> → 本地 Qwen，记录态全链路跑通</li>
                <li>• 类目受控枚举 + 「开销=已花的钱」语义：「要买牛奶」正确归「待办」</li>
                <li>• 确定性护栏：「明天下午3点」→ <code>2026-06-11T15:00+08:00</code>（带时区）；金额正则兜底抽 <code>38</code></li>
                <li>• 回忆态 tool-loop（L1~L2）：一问触发 aggregateExpense + listTodos 两步，SSE 逐步推送 + 综合作答</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> 待做（下一轮）
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <li>• 敏感数据（账号密码类）落库明文，待定加密 / UI 打码策略</li>
                <li>• 语义模糊回忆（向量检索）：笔记攒多、关键字捞不全时再加 semanticSearch 工具</li>
                <li>• 回忆态步数/工具调用未做单测；阈值与 maxToolCallingRoundTrips 待压测</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  )
}

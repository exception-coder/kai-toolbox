import type { ComponentType, ReactNode } from 'react'
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

const techStack: { layer: string; choice: string; alt: string; why: string }[] = [
  {
    layer: '后端框架',
    choice: 'Spring Boot 3.4',
    alt: '—',
    why: '顺 kai-toolbox 现有栈：自动装配、虚拟线程、SSE 现成',
  },
  {
    layer: 'Agent 框架',
    choice: 'LangChain4j',
    alt: 'Spring AI',
    why: '生态广、AiServices/tool/memory 抽象贴 agent、学习资料多；代价是手动接 Spring（学习项目反而是好事）',
  },
  {
    layer: 'LLM 运行时',
    choice: 'Ollama（本地）',
    alt: '云端 OpenAI 兼容网关',
    why: '本地零成本 + 隐私安全：私人笔记不出本机',
  },
  {
    layer: '模型',
    choice: 'Qwen2.5-7B-Instruct',
    alt: 'Qwen2.5-3B / Gemma3n-E4B',
    why: '中文母语级 + 原生 function calling；4.7GB 比 Gemma 9.6GB 还小，已实测通过',
  },
  {
    layer: 'LLM 接口协议',
    choice: 'OpenAI 兼容 /v1',
    alt: '原生 Ollama API',
    why: '一套抽象本地/云端通用，换模型只改 application.yml',
  },
  {
    layer: '结构化输出',
    choice: 'JSON Schema 约束解码',
    alt: '纯 prompt 约束',
    why: '服务层锁死合法 JSON，小模型也稳，兜住“乱答”',
  },
  {
    layer: '持久化',
    choice: 'SQLite（Spring JDBC）',
    alt: '—',
    why: '单用户本地；顺 kai-toolbox 约定，每 tool 独立 schema',
  },
  {
    layer: '实时进度',
    choice: 'SSE（SseEmitterRegistry）',
    alt: 'WebSocket',
    why: '单向推送够用、仓库现成；把 agent 每步推到前端可视化',
  },
  {
    layer: '前端',
    choice: 'React 19 + Vite + Tailwind v4',
    alt: '—',
    why: '顺 kai-toolbox 外壳，feature 自动注册进菜单',
  },
]

const robustness: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '一句话夹好几件事', guard: '强制输出 items[] 数组（schema 约束）' },
  { tag: '②', risk: '分类拿不准', guard: 'confidence 字段 + 阈值路由“待复核”' },
  { tag: '③', risk: '模型 JSON 乱答', guard: 'JSON Schema 约束 + 解析失败重试 → 降级为纯笔记' },
  { tag: '④', risk: '“明天/下周三”相对时间', guard: 'System Prompt 注入当前时间 {now}' },
  { tag: '⑤', risk: '回忆态死循环', guard: 'max steps 上限，超了用现有信息作答' },
  { tag: '⑥', risk: '工具(SQL)报错', guard: '异常回喂模型让它纠正，而非整体崩溃' },
  { tag: '⑦', risk: '全程不可观测', guard: 'ChatModelListener 记录每轮 + SSE 流式推前端' },
]

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-2xl font-bold tracking-tight">AI 秘书 · 架构总览</h1>
          <Badge variant="secondary">设计稿 v1</Badge>
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
              desc="OpenAiChatModel → http://localhost:11434/v1"
              tone="muted"
            />
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
            <HFlow
              steps={[
                { icon: Cpu, title: 'Ollama · Qwen2.5-7B', desc: '本地推理（OpenAI 兼容）', tone: 'accent' },
                { icon: Database, title: 'SQLite（assistant-schema）', desc: '记录持久化' },
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

      {/* 中间件选型 */}
      <Section icon={Boxes} title="中间件 / 技术选型" subtitle="每个选择 + 备选 + 为什么选它">
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--color-muted-foreground)]">
                  <th className="px-4 py-3 font-medium">层 / 关注点</th>
                  <th className="px-4 py-3 font-medium">选型</th>
                  <th className="px-4 py-3 font-medium">备选</th>
                  <th className="px-4 py-3 font-medium">为什么选它</th>
                </tr>
              </thead>
              <tbody>
                {techStack.map(t => (
                  <tr key={t.layer} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{t.layer}</td>
                    <td className="px-4 py-3">
                      <Badge>{t.choice}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{t.alt}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{t.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <li>• 回忆态 tool calling：正确触发函数并从中文问句抽出 <code>keyword=吃饭 / time_range=上周</code></li>
                <li>• 记录态结构化输出：一句话拆成 3 条记录，带 confidence</li>
                <li>• 相对时间解析：“明天下午3点” → <code>2026-06-11T15:00:00</code></li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> 待修正（已纳入实现）
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <li>• 分类失控：模型自创类目 → schema 里 <code>category</code> 设 enum 锁死</li>
                <li>• 金额漏抽：“打车花了38块”未填 amount → prompt 强调开销必抽 amount</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  )
}

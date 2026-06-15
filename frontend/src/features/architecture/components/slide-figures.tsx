// 可嵌入正文 Section 的「图文并茂」图示：把每页核心知识点可视化（图文同页）。
// 动画 keyframes 由 TeamVibeCoding 顶层 <style> 全局注入（kaiFlow/kaiBar/kaiFloat/kaiPulse/kaiGate/kaiSpin）。
import { Fragment, type ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { User, Keyboard, Bot, ArrowRight, ArrowDown, ShieldCheck, CheckCircle2, XCircle, Repeat, Database, Sparkles } from 'lucide-react'

type Icon = ComponentType<LucideProps>
type Tone = 'default' | 'primary' | 'accent' | 'muted' | 'danger'

const TONE: Record<Tone, string> = {
  default: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
  primary: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
  accent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  muted: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
  danger: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
}

/** 通用生动流程图：节点(图标圆+标签) + 脉动箭头连接；横向或竖向。用于把流程类核心知识点可视化。 */
export function StepFlow({ nodes, vertical = false, note }: { nodes: { icon: Icon; label: string; sub?: string; tone?: Tone }[]; vertical?: boolean; note?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-[var(--color-muted)]/30 p-4 sm:p-5">
      <div className={vertical ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row sm:items-stretch'}>
        {nodes.map((n, i) => (
          <Fragment key={i}>
            <div className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border bg-[var(--color-card)] px-3 py-3 text-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${TONE[n.tone ?? 'default']}`}>
                <n.icon className="h-5 w-5" style={{ animation: `kaiFloat 3s ease-in-out ${i * 0.25}s infinite` }} />
              </div>
              <div className="text-xs font-semibold">{n.label}</div>
              {n.sub && <div className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">{n.sub}</div>}
            </div>
            {i < nodes.length - 1 &&
              (vertical ? (
                <ArrowDown className="mx-auto h-5 w-5 text-[var(--color-primary)]" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
              ) : (
                <>
                  <ArrowRight className="hidden h-5 w-5 shrink-0 self-center text-[var(--color-primary)] sm:block" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
                  <ArrowDown className="mx-auto block h-5 w-5 text-[var(--color-primary)] sm:hidden" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
                </>
              ))}
          </Fragment>
        ))}
      </div>
      {note && <p className="text-center text-xs text-[var(--color-muted-foreground)]">{note}</p>}
    </div>
  )
}

/** 对比图：坑（✗）→ 护栏（✓）。用于反模式 / 取舍类核心知识点。 */
export function Contrast({ left, right, note }: { left: { title: string; points: string[] }; right: { title: string; points: string[] }; note?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-[var(--color-muted)]/30 p-4 sm:p-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
            <XCircle className="h-5 w-5" style={{ animation: 'kaiFloat 3s ease-in-out infinite' }} /> {left.title}
          </div>
          <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
            {left.points.map((p) => <li key={p}>· {p}</li>)}
          </ul>
        </div>
        <ArrowRight className="mx-auto h-6 w-6 rotate-90 text-[var(--color-primary)] sm:rotate-0" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
        <div className="flex-1 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" style={{ animation: 'kaiFloat 3s ease-in-out .5s infinite' }} /> {right.title}
          </div>
          <ul className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
            {right.points.map((p) => <li key={p}>· {p}</li>)}
          </ul>
        </div>
      </div>
      {note && <p className="text-center text-xs text-[var(--color-muted-foreground)]">{note}</p>}
    </div>
  )
}

/** 新旧对比：传统逐行写 vs Vibe Coding 指挥 AI。嵌入「心智转变」页。 */
export function FigNewOld() {
  return (
    <div className="space-y-3">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border bg-[var(--color-muted)]/40 p-5 text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">传统开发</div>
          <div className="flex items-center justify-center gap-2 text-[var(--color-muted-foreground)]">
            <User className="h-9 w-9" />
            <Keyboard className="h-7 w-7" />
          </div>
          <div className="mt-3 text-sm font-semibold">人逐行写代码</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">AI 只帮补全</div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
            <div className="h-full rounded-full bg-[var(--color-muted-foreground)]/50" style={{ animation: 'kaiBar 4s ease-in-out infinite alternate' }} />
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">改一行 → 调一次 → 反复，慢</div>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="h-7 w-7 text-[var(--color-primary)]" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
        </div>

        <div className="rounded-2xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-5 text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Vibe Coding</div>
          <div className="flex items-center justify-center gap-1.5">
            <User className="h-9 w-9" style={{ animation: 'kaiFloat 3s ease-in-out infinite' }} />
            <div className="relative flex h-6 w-10 items-center justify-center">
              {[0, 1, 2].map((i) => (
                <span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" style={{ animation: `kaiFlow 1.4s ease-in-out ${i * 0.4}s infinite` }} />
              ))}
            </div>
            <Bot className="h-9 w-9 text-[var(--color-primary)]" style={{ animation: 'kaiFloat 3s ease-in-out .5s infinite' }} />
          </div>
          <div className="mt-3 text-sm font-semibold">人定义需求，AI 生产</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">人只做验收</div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-primary)]/15">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ animation: 'kaiBar 1.2s ease-in-out infinite alternate' }} />
          </div>
          <div className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">说清要什么 → AI 成稿 → 人拍板，快</div>
        </div>
      </div>
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        一句话：<b className="text-[var(--color-foreground)]">你的角色从「写代码」升级为「定义需求 + 验收」</b>。
      </p>
    </div>
  )
}

/** AI 提议、程序裁决：确定性闸门把关。嵌入「五大核心原则」页。 */
export function FigDeterministic() {
  return (
    <div className="space-y-3 rounded-2xl border bg-[var(--color-muted)]/30 p-5">
      <div className="text-center text-sm font-semibold">确定性优先怎么落地：AI 提议，程序裁决</div>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="flex w-32 flex-col items-center gap-1 rounded-xl border bg-[var(--color-card)] px-4 py-3 text-center">
          <Bot className="h-8 w-8 text-amber-500" style={{ animation: 'kaiFloat 3s ease-in-out infinite' }} />
          <div className="text-xs font-semibold">AI 提议</div>
          <div className="text-[11px] text-[var(--color-muted-foreground)]">可能幻觉</div>
        </div>

        <div className="relative flex h-6 w-12 items-center justify-center sm:w-16">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" style={{ animation: `kaiFlow 1.4s ease-in-out ${i * 0.4}s infinite` }} />
          ))}
        </div>

        <div className="flex w-40 flex-col items-center gap-1 rounded-xl border-2 border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5 px-4 py-3 text-center" style={{ animation: 'kaiGate 2s ease-in-out infinite' }}>
          <ShieldCheck className="h-8 w-8 text-[var(--color-primary)]" />
          <div className="text-xs font-semibold">程序闸门</div>
          <div className="text-[11px] text-[var(--color-muted-foreground)]">编译 / 测试 / 规则校验</div>
        </div>

        <ArrowRight className="h-6 w-6 rotate-90 text-[var(--color-muted-foreground)] sm:rotate-0" />

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> 通过 → 合并
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400">
            <XCircle className="h-4 w-4" /> 拦截 → 退回
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        通俗：<b className="text-[var(--color-foreground)]">AI 说的不算数，编译 / 测试 / 规则验过才算</b>——能用程序定的，绝不靠 AI 自觉。
      </p>
    </div>
  )
}

/** 知识飞轮：经验回流，越用越聪明。嵌入「端到端落地」页。 */
export function FigFlywheel() {
  const nodes = [
    { icon: Database, label: '查回规则' },
    { icon: Bot, label: '合规生成' },
    { icon: CheckCircle2, label: '少返工' },
    { icon: Sparkles, label: '沉淀新知识' },
  ]
  return (
    <div className="space-y-3 rounded-2xl border bg-[var(--color-muted)]/30 p-5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {nodes.map((n, i) => (
          <Fragment key={n.label}>
            <div className="flex w-24 flex-col items-center gap-1 rounded-xl border bg-[var(--color-card)] px-3 py-3">
              <n.icon className="h-7 w-7 text-[var(--color-primary)]" style={{ animation: `kaiFloat 3s ease-in-out ${i * 0.3}s infinite` }} />
              <div className="text-center text-xs font-medium">{n.label}</div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" style={{ animation: 'kaiPulse 1.6s ease-in-out infinite' }} />
          </Fragment>
        ))}
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-medium text-[var(--color-primary)]">
          <Repeat className="h-4 w-4" style={{ animation: 'kaiSpin 4s linear infinite' }} /> 回到起点 · 更准
        </div>
      </div>
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        通俗：<b className="text-[var(--color-foreground)]">团队经验沉淀进知识库，AI 就像「越带越熟的老员工」</b>。
      </p>
    </div>
  )
}

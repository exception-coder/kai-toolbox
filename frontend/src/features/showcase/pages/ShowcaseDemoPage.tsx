import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Workflow, ScanLine, Tags, Repeat } from 'lucide-react'

/**
 * 示例展示页（/showcase/demo）—— 跑通 ShowcaseLayout 的端到端样例。
 * 刻意走「技术蓝图(blueprint)」美学：深色画布 + 等幅标签 + 特大标题 + 发光连线 + 网格底纹，
 * 全屏 edge-to-edge、无侧边栏，是产品官网/信息图风，而非后台 CRUD。内容可整段替换成你自己的。
 *
 * 字体不外链（境内 Google Fonts 不稳）：用系统等幅栈做蓝图标签，靠排版/留白/连线出效果。
 */

const MONO = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace"

/** 进入视口时淡入上浮（轻量 IntersectionObserver，无依赖）。 */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
    >
      {children}
    </div>
  )
}

const FLOW = [
  { icon: ScanLine, k: '01', t: '采集 / 录制', d: '浏览器里点一遍，自动录下每一次 HTTP 调用与交互轨迹。' },
  { icon: Tags, k: '02', t: '理解 / 标注', d: '把动态参数标出来，固定的归代码、模糊的才交给 LLM 判断。' },
  { icon: Workflow, k: '03', t: '编排 / 组合', d: '在画布上把调用串成有依赖的任务流，确定性优先、LLM 兜底。' },
  { icon: Repeat, k: '04', t: '回放 / 执行', d: '一键回放，参数化重跑，结果归档可追溯。' },
]

const LAYERS = [
  { tag: 'CLIENT', t: '端', d: 'React 19 · 工具台 / 展示页双布局' },
  { tag: 'EDGE', t: '网关', d: 'Spring MVC · SSE 流式 · 软鉴权' },
  { tag: 'CORE', t: '服务', d: '多模块工具 · 虚拟线程 · Node sidecar' },
  { tag: 'DATA', t: '数据', d: 'SQLite(WAL) · 每工具独占 schema' },
]

export function ShowcaseDemoPage() {
  return (
    <div
      className="min-h-screen w-full text-slate-100"
      style={{ background: '#070b14', fontFamily: MONO }}
    >
      {/* 画布底纹：网格 + 两团径向辉光，营造蓝图氛围（非纯色背景） */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(60rem 60rem at 82% -8%, rgba(34,211,238,.16), transparent 60%),' +
            'radial-gradient(48rem 48rem at 6% 108%, rgba(16,185,129,.14), transparent 60%),' +
            'linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 100% 100%, 44px 44px, 44px 44px',
        }}
      />

      <div className="relative z-10">
        {/* ── Hero：全视口 ─────────────────────────────────────────── */}
        <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-24">
          <div
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 text-[11px] tracking-[0.3em] text-cyan-300"
            style={{ animation: 'sc-fade .7s ease-out both' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> KAI · TOOLBOX BLUEPRINT
          </div>

          <h1
            className="max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight text-white sm:text-7xl"
            style={{ animation: 'sc-fade .8s ease-out .08s both' }}
          >
            把重复的手工活，
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent">
              录一遍就自动化。
            </span>
          </h1>

          <p
            className="mt-6 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base"
            style={{ animation: 'sc-fade .8s ease-out .16s both', fontFamily: 'system-ui, sans-serif' }}
          >
            一个本地单人工具工作台。这是「展示型布局」的样例页 —— 全屏、无侧边栏、产品官网风，
            和工具页的后台风共存，互不打架。
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4" style={{ animation: 'sc-fade .8s ease-out .24s both' }}>
            <Link
              to="/"
              className="group inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.03]"
            >
              进入工作台
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="text-[11px] tracking-[0.25em] text-slate-500">/SHOWCASE/DEMO</span>
          </div>

          <div className="mt-24 flex items-center gap-2 text-[11px] tracking-[0.3em] text-slate-500">
            <ArrowDown className="h-4 w-4 animate-bounce" /> SCROLL
          </div>
        </section>

        {/* ── 纵向故事流：业务流程 ───────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 py-28">
          <Reveal>
            <div className="mb-14">
              <div className="text-[11px] tracking-[0.3em] text-cyan-300">— 工作流</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">四步，把流程沉淀成资产</h2>
            </div>
          </Reveal>

          <div className="relative">
            {/* 发光主干线 */}
            <div className="absolute left-[27px] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-400/60 via-teal-400/30 to-transparent" />
            <div className="space-y-10">
              {FLOW.map((s, i) => (
                <Reveal key={s.k} delay={i * 90}>
                  <div className="relative flex gap-6">
                    <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-[#0b1120] text-cyan-300 shadow-[0_0_40px_-12px_rgba(34,211,238,.6)]">
                      <s.icon className="h-6 w-6" />
                    </div>
                    <div className="pt-1">
                      <div className="text-[11px] tracking-[0.3em] text-slate-500">{s.k}</div>
                      <div className="mt-1 text-lg font-semibold text-white">{s.t}</div>
                      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-400" style={{ fontFamily: 'system-ui, sans-serif' }}>
                        {s.d}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 横向架构蓝图 ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-28">
          <Reveal>
            <div className="mb-14">
              <div className="text-[11px] tracking-[0.3em] text-emerald-300">— 系统蓝图</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">一条请求穿过四层</h2>
            </div>
          </Reveal>

          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            {LAYERS.map((l, i) => (
              <div key={l.tag} className="contents">
                <Reveal delay={i * 90}>
                  <div className="group flex-1 rounded-2xl border border-slate-700/60 bg-[#0b1120]/70 p-5 transition-colors hover:border-cyan-400/50">
                    <div className="text-[11px] tracking-[0.3em] text-cyan-300/80">{l.tag}</div>
                    <div className="mt-2 text-2xl font-bold text-white">{l.t}</div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400" style={{ fontFamily: 'system-ui, sans-serif' }}>
                      {l.d}
                    </p>
                  </div>
                </Reveal>
                {i < LAYERS.length - 1 && (
                  <ArrowRight className="mx-auto hidden h-5 w-5 shrink-0 text-slate-600 lg:block" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 收尾 CTA ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-32 pt-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[#0b1120] to-[#0a0f1a] px-8 py-16 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(30rem 20rem at 50% 0%, rgba(34,211,238,.15), transparent 70%)' }}
              />
              <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-5xl">
                这页就是「展示布局」本身
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-sm text-slate-400" style={{ fontFamily: 'system-ui, sans-serif' }}>
                复制 <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">features/showcase</code> 改内容，
                manifest 标 <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">layout: 'showcase'</code> 即可新增一张展示页。
              </p>
              <Link
                to="/"
                className="relative mt-8 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/10"
              >
                返回工作台 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </section>
      </div>

      {/* 入场关键帧（局部，避免污染全局样式） */}
      <style>{`@keyframes sc-fade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}

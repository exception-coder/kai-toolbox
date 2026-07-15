import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Code2,
  FileText,
  GitBranch,
  Lightbulb,
  MessageSquareText,
  Monitor,
  RefreshCw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'
import { DEMO_EXAMPLES, type DemoExample } from '../examples'

// ───── 工具 ─────
function Badge({ label, variant }: { label: string; variant: 'blue' | 'purple' | 'green' }) {
  const cls = {
    blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    green: 'bg-green-500/15 text-green-400 border border-green-500/30',
  }[variant]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ───── Hero ─────
function Hero() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-8 py-20 text-center">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          Claude Code · MCP · 知识图谱
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          AI 驱动的完整研发链路
        </h1>
        <p className="text-slate-400 text-lg mb-3 leading-relaxed">
          从需求登记到功能上线，在工作台一体完成
        </p>
        <p className="text-slate-500 text-sm mb-10">
          需求澄清 → PRD 生成 → Claude Code 开发 → Vite 实时预览
        </p>

        {/* 流程步骤摘要 */}
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {[
            { label: '需求登记', icon: FileText },
            { label: 'AI 澄清', icon: BrainCircuit },
            { label: 'PRD 生成', icon: BookOpen },
            { label: '工作台开发', icon: Code2 },
            { label: '实时预览', icon: Monitor },
          ].map(({ label, icon: Icon }, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
                <Icon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs">{label}</span>
              </div>
              {i < 4 && <ArrowRight className="w-3 h-3 text-slate-600" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ───── 工作流步骤 ─────
const STEPS = [
  {
    step: '01',
    title: '需求登记',
    icon: FileText,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    desc: '产品/业务方在工作台输入需求描述，选择关联项目和模块。知识图谱自动注入上下文。',
    detail: '支持粘贴、富文本，关联已有项目目录',
  },
  {
    step: '02',
    title: 'AI 智能澄清',
    icon: BrainCircuit,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    desc: 'Claude 基于业务知识图谱提出 5 个精准澄清问题，消除需求模糊点和边界歧义。',
    detail: '知识图谱让问题从通用变精准',
  },
  {
    step: '03',
    title: 'PRD 自动生成',
    icon: BookOpen,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    desc: '结合原始需求和澄清问答，Claude 生成结构化 PRD 文档，涵盖功能边界、数据模型、验收标准。',
    detail: '落盘为 Markdown，支持在线编辑',
  },
  {
    step: '04',
    title: '工作台开发',
    icon: Code2,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    desc: '一键将 PRD 注入 Claude 工作台（Vibe Coding），开发者直接对话实现功能，Vite 实时预览变更。',
    detail: '边改边看，后端重启一键完成',
  },
]

function WorkflowSection() {
  return (
    <section className="bg-slate-900 px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-2">四步完成需求到交付</h2>
        <p className="text-slate-500 text-center text-sm mb-10">每一步都在工作台内完成，无需切换工具</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ step, title, icon: Icon, color, bg, border, desc, detail }) => (
            <div key={step} className={`relative rounded-xl border ${border} ${bg} p-5 flex flex-col gap-3`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} border ${border}`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <span className="text-slate-600 text-xs font-mono">{step}</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm mb-1.5">{title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
              </div>
              <div className={`mt-auto pt-3 border-t ${border}`}>
                <span className={`text-[11px] ${color} font-medium`}>{detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ───── 知识图谱对比 ─────
function KnowledgeGraphSection({ example }: { example: DemoExample }) {
  if (!example.comparison) return null
  return (
    <section className="bg-slate-950 px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit className="w-5 h-5 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">知识图谱的价值</h2>
        </div>
        <p className="text-slate-500 text-sm mb-2">
          以「{example.title}」需求为例，对比有无知识图谱时 AI 的澄清质量
        </p>
        <p className="text-slate-600 text-xs mb-8 flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5" />
          知识库来源：project-domain-knowledge 仓库，按项目维护模块结构、业务规则、API 约定
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 没有知识图谱 */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-semibold text-sm">无知识图谱 — 通用模糊问题</span>
            </div>
            <div className="space-y-2.5">
              {example.comparison.withoutKg.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-600 text-xs mt-0.5 flex-shrink-0">Q{i + 1}.</span>
                  <span className="text-slate-400 text-xs leading-relaxed">{q}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-red-500/20 text-xs text-red-400/70">
              ↑ 这类问题开发者也不一定知道答案，澄清效果有限
            </div>
          </div>

          {/* 有知识图谱 */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 font-semibold text-sm">有知识图谱 — 精准可操作问题</span>
            </div>
            <div className="space-y-2.5">
              {example.comparison.withKg.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-600 text-xs mt-0.5 flex-shrink-0">Q{i + 1}.</span>
                  <span className="text-slate-200 text-xs leading-relaxed">{q}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-blue-500/20 text-xs text-blue-400/70">
              ↑ 引用了已有表名、类名、接口路径，开发者直接能做决策
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ───── 业务逻辑澄清价值 ─────
function ClarifyValueSection({ example }: { example: DemoExample }) {
  if (!example.clarifyValue) return null
  return (
    <section className="bg-slate-900 px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h2 className="text-2xl font-bold text-white">业务逻辑澄清的价值</h2>
        </div>
        <p className="text-slate-500 text-sm mb-8">
          以「{example.title}」需求为例，展示澄清前后的开发结果差异
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-semibold text-sm">不澄清直接开发</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{example.clarifyValue.withoutClarify}</p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-green-400 font-semibold text-sm">澄清后再开发</span>
            </div>
            <p className="text-slate-200 text-sm leading-relaxed">{example.clarifyValue.afterClarify}</p>
          </div>
        </div>

        {/* 澄清示例 */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareText className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-semibold text-sm">AI 澄清阶段提出的关键问题（节选）</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300">
            {[
              'PDF 导出在浏览器端（jsPDF）还是服务端生成？考虑中文字体嵌入和分页精确性',
              '内容超过一页时如何处理？工作经历条目是否允许跨页？',
              '是否支持多套模板（现代简约/商务经典）？MVP 阶段固定一套还是可切换？',
              '导出时是否对手机号、邮箱等敏感信息做脱敏处理？',
            ].map((q, i) => (
              <div key={i} className="flex gap-2 bg-slate-900/50 rounded p-2.5">
                <span className="text-amber-500 font-mono text-[10px] mt-0.5 flex-shrink-0">Q{i + 1}</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ───── Vite 实时预览演示 ─────
function LiveDevSection() {
  return (
    <section className="bg-slate-950 px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-green-400" />
          <h2 className="text-2xl font-bold text-white">边改边看</h2>
        </div>
        <p className="text-slate-500 text-sm mb-8">
          Claude 在 Vibe Coding 工作台修改代码，浏览器实时呈现变化
        </p>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Claude 编码 */}
          <div className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <span className="text-slate-400 text-xs ml-2">Vibe Coding — claude-chat</span>
            </div>
            <div className="p-4 font-mono text-xs space-y-2 text-slate-300">
              <div className="text-slate-500">{/* User */}</div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2.5 text-blue-300">
                请在简历详情页的 Tab 栏新增「完整度评分」选项卡，点击后显示各维度得分和改进建议
              </div>
              <div className="text-slate-500 mt-2">{/* Claude */}</div>
              <div className="bg-slate-800 rounded p-2.5 space-y-1">
                <div className="text-green-400">✓ 阅读 ResumeDetailPage.tsx...</div>
                <div className="text-green-400">✓ 分析现有 Tab 结构（experience/skills/projects）</div>
                <div className="text-yellow-400">→ 新增 ScoreTab 组件，调用 /api/v1/resume/score</div>
                <div className="text-slate-400">正在修改 frontend/src/features/resume/pages/...</div>
              </div>
              <div className="animate-pulse text-slate-500 text-[10px]">Claude 正在编写代码…</div>
            </div>
          </div>

          {/* 能力说明 */}
          <div className="space-y-3">
            {[
              {
                icon: Monitor,
                color: 'text-green-400',
                bg: 'bg-green-500/10',
                border: 'border-green-500/20',
                title: '前端热更新',
                desc: 'npm run dev 启动，Vite HMR 毫秒级刷新，代码改动即刻呈现',
              },
              {
                icon: RefreshCw,
                color: 'text-blue-400',
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/20',
                title: '后端快速重启',
                desc: '工作台内一键重启 Spring Boot，无需切 IDE，几秒后后端接口即就绪',
              },
              {
                icon: GitBranch,
                color: 'text-purple-400',
                bg: 'bg-purple-500/10',
                border: 'border-purple-500/20',
                title: 'Claude Code MCP',
                desc: 'ERP/SRM 数据库只读连接，开发中可直接查库验证业务逻辑',
              },
            ].map(({ icon: Icon, color, bg, border, title, desc }) => (
              <div key={title} className={`rounded-xl border ${border} ${bg} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className={`text-sm font-semibold ${color}`}>{title}</span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ───── 示例需求卡片 ─────
function ExamplesSection({ onTry }: { onTry: (example: DemoExample) => void }) {
  return (
    <section className="bg-slate-900 px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center mb-2">立即体验完整流程</h2>
        <p className="text-slate-500 text-sm text-center mb-10">
          选择一个典型示例需求，从澄清到 PRD 生成，全程在工作台完成
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {DEMO_EXAMPLES.map((ex) => (
            <div
              key={ex.id}
              className="group relative rounded-xl border border-slate-700 bg-slate-800/60 p-5 flex flex-col gap-3 hover:border-slate-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-semibold text-sm leading-snug">{ex.title}</h3>
                <Badge label={ex.badge} variant={ex.badgeVariant} />
              </div>

              <p className="text-slate-400 text-xs leading-relaxed flex-1">{ex.description}</p>

              <div className="rounded-lg bg-slate-900/60 px-3 py-2 text-xs">
                <div className="text-slate-500 mb-1">亮点</div>
                <div className="text-slate-300">{ex.highlight}</div>
              </div>

              <button
                onClick={() => onTry(ex)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-600/30 hover:text-blue-300 transition-colors group-hover:border-blue-500/50"
              >
                立即体验 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ───── CTA ─────
function CtaSection({ onStart }: { onStart: () => void }) {
  return (
    <section className="bg-gradient-to-br from-slate-900 to-slate-950 px-8 py-16 text-center border-t border-slate-800">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-3">从您自己的需求开始</h2>
        <p className="text-slate-500 text-sm mb-8">
          输入真实的业务需求，体验 AI 如何逐步将模糊想法转化为可落地的 PRD 文档
        </p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-600/20"
        >
          <FileText className="w-4 h-4" />
          打开 PRD 澄清助手
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  )
}

// ───── 主页面 ─────
export function DevWorkflowPage() {
  const navigate = useNavigate()

  const handleTryExample = (ex: DemoExample) => {
    // 把示例内容编码到 URL，prd-clarify 页面读取并预填充
    const params = new URLSearchParams({
      title: ex.title,
      rawInput: ex.rawInput,
      project: ex.project,
      module: ex.module,
    })
    navigate(`/tools/prd-clarify?${params.toString()}`)
  }

  const kgExample = DEMO_EXAMPLES[0]   // 知识图谱示例
  const clarifyExample = DEMO_EXAMPLES[1] // 业务逻辑澄清示例

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Hero />
      <WorkflowSection />
      <KnowledgeGraphSection example={kgExample} />
      <ClarifyValueSection example={clarifyExample} />
      <LiveDevSection />
      <ExamplesSection onTry={handleTryExample} />
      <CtaSection onStart={() => navigate('/tools/prd-clarify')} />
    </div>
  )
}

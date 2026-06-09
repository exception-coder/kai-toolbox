// 简历模块主页：引导式填写工作台 + 实时预览 + 导出
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileEdit,
  FileText,
  Layers3,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import '../styles/resume-templates.css'
import { ResumeEditor } from '../components/ResumeEditor'
import { ResumePreview } from '../components/ResumePreview'
import { TemplateSelector } from '../components/TemplateSelector'
import { ExportPanel } from '../components/ExportPanel'
import { DEFAULT_STATE, loadState, saveState } from '../lib/persistence'
import { emptyResume, SAMPLE_RESUME } from '../lib/sampleData'
import { buildFilename, captureNode, exportAsPdf, saveImage } from '../lib/exporter'
import type { ExportFormat, ResumeData, ResumeState } from '../types'
import { OptimizeProvider, WholeOptimizeButton } from '../optimize'

type MobileTab = 'edit' | 'preview'

export function ResumePage() {
  const [state, setState] = useState<ResumeState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit')
  const [privacyBlur, setPrivacyBlur] = useState(false)
  // 隐私遮罩下临时"点按查看"开关；切换隐私时复位
  const [peek, setPeek] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loadedState = await loadState()
      if (cancelled) return
      setState(loadedState)
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 防抖保存：连续编辑时合并写入，避免每次输入都触发持久化。
  useEffect(() => {
    if (!hydrated) return
    const handle = window.setTimeout(() => saveState(state), 500)
    return () => window.clearTimeout(handle)
  }, [state, hydrated])

  async function handleExport(fmt: ExportFormat) {
    const node = previewRef.current
    if (!node) throw new Error('预览未就绪')
    const filename = buildFilename(state.data.basics.name || 'resume', fmt)
    if (fmt === 'png') {
      const dataUrl = await captureNode(node, 2)
      await saveImage(dataUrl, filename)
      return
    }
    await exportAsPdf(node, filename)
  }

  function resetEmpty() {
    if (!confirm('清空所有内容？此操作不可撤销。')) return
    setState(s => ({ ...s, data: emptyResume() }))
  }

  function loadSample() {
    setState(s => ({ ...s, data: SAMPLE_RESUME }))
  }

  const quality = useMemo(() => getResumeQuality(state.data), [state.data])

  return (
    <OptimizeProvider data={state.data} onChange={data => setState(s => ({ ...s, data }))}>
      <div className="resume-workbench">
        <section className="resume-command-center">
          <div className="resume-command-main">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/8 px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              引导式简历工作台
            </div>
            <div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">个人简历</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted-foreground)]">
                从核心身份、经历素材、岗位匹配到视觉导出，一屏完成填写与预览。
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MetricCard label="完成度" value={`${quality.score}%`} tone="primary" />
              <MetricCard label="经历素材" value={`${quality.storyCount} 条`} tone="emerald" />
              <MetricCard label="当前建议" value={quality.nextAction} tone="amber" compact />
            </div>
          </div>

          <section className="resume-guidance-strip">
            <GuidanceItem
              icon={Target}
              title={quality.basicsReady ? '岗位定位已就绪' : '填写求职意向'}
              text={
                quality.basicsReady
                  ? '基本信息齐全，AI 优化会按岗位 + 年限派生级别改写。'
                  : '基本信息里填好求职意向 + 工作年限，AI 优化才能精准定位。'
              }
              active={!quality.basicsReady}
            />
            <GuidanceItem
              icon={FileText}
              title="内容结构"
              text={`${quality.filledSections}/5 个核心模块已有内容。`}
              active={quality.filledSections < 5}
            />
            <GuidanceItem
              icon={Layers3}
              title="视觉模板"
              text="切换模板和主色时，右侧预览实时刷新。"
            />
            <GuidanceItem
              icon={CheckCircle2}
              title="导出检查"
              text={quality.score >= 80 ? '内容已经接近可导出状态。' : '先补齐缺口再导出会更稳。'}
              active={quality.score < 80}
            />
          </section>

          <div className="resume-command-panel">
            <TemplateSelector
              template={state.template}
              accent={state.accent}
              onTemplateChange={template => setState(s => ({ ...s, template }))}
              onAccentChange={accent => setState(s => ({ ...s, accent }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={privacyBlur ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPrivacyBlur(v => !v); setPeek(false) }}
                title="仅遮挡屏幕预览，导出 PNG/PDF 不受影响"
              >
                {privacyBlur ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {privacyBlur ? '已模糊' : '隐私'}
              </Button>
              <Button variant="outline" size="sm" onClick={loadSample}>
                <Sparkles className="h-3.5 w-3.5" />
                示例
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetEmpty}
                className="col-span-2 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                清空
              </Button>
            </div>
            <ExportPanel onExport={handleExport} />
          </div>
        </section>

        <div className="flex md:hidden">
          <MobileTabBar value={mobileTab} onChange={setMobileTab} />
        </div>

        <main className="resume-studio-grid">
          <div className={cn('resume-editor-pane', mobileTab === 'preview' && 'hidden md:flex')}>
            {!quality.basicsReady && (
              <div className="rounded-lg border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/6 px-3 py-2 text-xs leading-5 text-[var(--color-primary)]">
                先在「基本信息」填好求职意向 + 工作年限，AI 优化会按岗位级别精准改写。
              </div>
            )}
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">AI 优化</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                  单段：每段右下角「AI 优化本段」。整篇：一次通读全简历、跨段统筹、逐段采纳。
                </div>
              </div>
              <WholeOptimizeButton className="shrink-0" />
            </div>
            <ResumeEditor
              data={state.data}
              quality={quality}
              onChange={data => setState(s => ({ ...s, data }))}
            />
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/8 md:hidden"
              onClick={() => setMobileTab('preview')}
            >
              <Eye className="h-4 w-4" />
              查看实时预览
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className={cn('resume-preview-pane', mobileTab === 'edit' && 'hidden md:flex')}>
            <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-[var(--color-muted-foreground)]"
                onClick={() => setMobileTab('edit')}
              >
                <FileEdit className="h-3.5 w-3.5" />
                返回编辑
              </button>
              <div className="ml-auto">
                <ExportPanel onExport={handleExport} />
              </div>
            </div>

            <div className="resume-preview-header">
              <div>
                <p className="text-xs font-medium uppercase text-[var(--color-muted-foreground)]">Live Preview</p>
                <h2 className="text-sm font-semibold">A4 实时预览</h2>
              </div>
              <span className="rounded-full border bg-[var(--color-background)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]">
                {privacyBlur ? '隐私保护中' : '导出就绪'}
              </span>
            </div>

            <div className="relative flex flex-1 [justify-content:safe_center] overflow-auto p-3 md:max-h-[calc(100vh-220px)]">
              <div
                className={cn(
                  'resume-paper-shadow transition-[filter] duration-200',
                  privacyBlur && !peek && 'blur-md select-none',
                )}
              >
                <ResumePreview
                  ref={previewRef}
                  data={state.data}
                  template={state.template}
                  accent={state.accent}
                />
              </div>

              {/* 隐私遮罩：用不透明叠层而非 filter:blur——后者作用在 794px 的 A4 大画布上，
                  移动端浏览器常丢弃不渲染（这正是"模糊没效果"的根因）。叠层是纯合成，所有设备可靠。
                  叠层是 previewRef 的兄弟节点，不在导出节点内 → 导出 PNG/PDF 不受影响。点按可临时查看。 */}
              {privacyBlur && !peek && (
                <button
                  type="button"
                  onClick={() => setPeek(true)}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-background)]/90 backdrop-blur-md"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-background)]/95 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] shadow-md">
                    <Shield className="h-3.5 w-3.5" />
                    隐私保护中 · 点按查看（导出不受影响）
                  </span>
                </button>
              )}
              {privacyBlur && peek && (
                <button
                  type="button"
                  onClick={() => setPeek(false)}
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-background)]/95 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] shadow-md backdrop-blur"
                >
                  <Shield className="h-3.5 w-3.5" />
                  重新遮挡
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </OptimizeProvider>
  )
}

export interface ResumeQuality {
  score: number
  storyCount: number
  filledSections: number
  nextAction: string
  basicsReady: boolean
  workReady: boolean
  projectsReady: boolean
  educationReady: boolean
  skillsReady: boolean
}

function getResumeQuality(data: ResumeData): ResumeQuality {
  // basicsReady 隐含包含 jobIntent 非空，去 JD 化后 AI 优化的就绪条件也由它代表
  const basicsReady = Boolean(data.basics.name && data.basics.phone && data.basics.jobIntent)
  const workReady = data.work.some(item => item.company && item.role)
  const projectsReady = data.projects.some(item => item.name && item.responsibilities.length > 0)
  const educationReady = data.education.some(item => item.school && item.major)
  const skillsReady = data.skills.length >= 3
  const checks = [basicsReady, workReady, projectsReady, educationReady, skillsReady]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)
  const storyCount =
    data.work.reduce((sum, item) => sum + item.responsibilities.length + item.achievements.length, 0) +
    data.projects.reduce((sum, item) => sum + item.responsibilities.length + item.achievements.length, 0)
  const nextAction = getNextAction({
    basicsReady,
    workReady,
    projectsReady,
    educationReady,
    skillsReady,
  })

  return {
    score,
    storyCount,
    filledSections: checks.filter(Boolean).length,
    nextAction,
    basicsReady,
    workReady,
    projectsReady,
    educationReady,
    skillsReady,
  }
}

function getNextAction(checks: {
  basicsReady: boolean
  workReady: boolean
  projectsReady: boolean
  educationReady: boolean
  skillsReady: boolean
}): string {
  if (!checks.basicsReady) return '补身份'
  if (!checks.workReady) return '写经历'
  if (!checks.projectsReady) return '补项目'
  if (!checks.skillsReady) return '加技能'
  if (!checks.educationReady) return '补教育'
  return '可导出'
}

function MetricCard({
  label,
  value,
  tone,
  compact,
}: {
  label: string
  value: string
  tone: 'primary' | 'emerald' | 'amber'
  compact?: boolean
}) {
  const toneClass = {
    primary: 'text-[var(--color-primary)] bg-[var(--color-primary)]/8 border-[var(--color-primary)]/18',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900',
    amber: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900',
  }[tone]

  return (
    <div className={cn('rounded-lg border px-3 py-2', toneClass)}>
      <div className="text-[11px] font-medium opacity-75">{label}</div>
      <div className={cn('mt-1 font-semibold', compact ? 'text-sm' : 'text-xl')}>{value}</div>
    </div>
  )
}

function GuidanceItem({
  icon: Icon,
  title,
  text,
  active,
}: {
  icon: typeof Target
  title: string
  text: string
  active?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-2',
        active && 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5',
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-primary)]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold">{title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-muted-foreground)]">{text}</div>
      </div>
    </div>
  )
}

function MobileTabBar({
  value,
  onChange,
}: {
  value: MobileTab
  onChange: (t: MobileTab) => void
}) {
  return (
    <div className="inline-flex w-full rounded-lg border bg-[var(--color-muted)] p-1">
      {([
        { id: 'edit' as const, label: '编辑', icon: FileEdit },
        { id: 'preview' as const, label: '预览', icon: Eye },
      ] as const).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
            value === id
              ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

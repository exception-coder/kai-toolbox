import { useEffect, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import '../styles/card-themes.css'
import { cn } from '@/lib/utils'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { ThemeSelector } from '../components/ThemeSelector'
import { SlideRatioSwitcher } from '../components/SlideRatioSwitcher'
import { SplitModeSwitcher } from '../components/SplitModeSwitcher'
import { WatermarkForm } from '../components/WatermarkForm'
import { ExportButton } from '../components/ExportButton'
import { CardRenderer } from '../components/CardRenderer'
import type { SlideCardsHandle } from '../components/SlideCards'
import { DEFAULT_STATE, loadState, saveState } from '../lib/persistence'
import { captureNode, exportSlides, saveImage, buildFilename } from '../lib/exporter'
import type { Mode, PersistedState, SlideRatio, SplitMode, Theme, Watermark } from '../types'

type MobileTab = 'edit' | 'preview'

export function MarkdownCardPage() {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit')
  const singleNodeRef = useRef<HTMLDivElement>(null)
  const slideHandleRef = useRef<SlideCardsHandle>(null)

  useEffect(() => {
    setState(loadState())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveState(state)
  }, [state, hydrated])

  const setText = (sourceText: string) => setState(s => ({ ...s, sourceText }))
  const setMode = (mode: Mode) => setState(s => ({ ...s, mode }))
  const setTheme = (theme: Theme) => setState(s => ({ ...s, theme }))
  const setSlideRatio = (slideRatio: SlideRatio) => setState(s => ({ ...s, slideRatio }))
  const setSplitMode = (splitMode: SplitMode) => setState(s => ({ ...s, splitMode }))
  const setWatermark = (watermark: Watermark) => setState(s => ({ ...s, watermark }))

  const isEmpty = !state.sourceText.trim()

  async function handleExport(setProgress: (m: string | null) => void) {
    if (state.mode === 'slide') {
      const handle = slideHandleRef.current
      if (!handle) throw new Error('幻灯渲染器未就绪')
      const nodes = handle.getSlideNodes()
      if (nodes.length === 0) throw new Error('没有可导出的幻灯页')
      await exportSlides(nodes, state.mode, (i, total) =>
        setProgress(`导出第 ${i} / ${total} 张…`),
      )
      return
    }
    const node = singleNodeRef.current
    if (!node) throw new Error('卡片渲染器未就绪')
    setProgress('正在渲染图片…')
    const dataUrl = await captureNode(node)
    setProgress('正在保存…')
    await saveImage(dataUrl, buildFilename(state.mode))
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-4 md:gap-4 md:px-4 md:py-6">

      {/* 顶部标题栏：移动端紧凑 */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-xl">Markdown 转卡片</h1>
          <p className="hidden text-sm text-[var(--color-muted-foreground)] sm:block">
            三种模式 + 五套主题，纯前端导出 PNG。PC 直接下载，移动端走系统分享面板。
          </p>
        </div>
        <ExportButton onExport={handleExport} disabled={isEmpty} />
      </header>

      {/* 工具栏：移动端多行折叠 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-2.5">
        <ModeSwitcher value={state.mode} onChange={setMode} />

        {state.mode === 'slide' && (
          <div className="flex flex-wrap items-center gap-2">
            <SlideRatioSwitcher value={state.slideRatio} onChange={setSlideRatio} />
            <SplitModeSwitcher value={state.splitMode} onChange={setSplitMode} />
          </div>
        )}

        {/* 主题：桌面端右对齐，移动端折行显示 */}
        <div className="md:ml-auto">
          <ThemeSelector value={state.theme} onChange={setTheme} />
        </div>
      </div>

      {/* 移动端专用：编辑 / 预览 Tab 切换 */}
      <div className="flex md:hidden">
        <MobileTabBar value={mobileTab} onChange={setMobileTab} />
      </div>

      {/* 内容区：桌面双栏，移动单栏+Tab */}
      <div className="grid gap-3 md:gap-4 md:grid-cols-[minmax(0,_1fr)_minmax(0,_1.2fr)]">

        {/* 左栏：编辑器 + 水印配置 */}
        <div className={cn('flex flex-col gap-3', mobileTab === 'preview' && 'hidden md:flex')}>
          <div className="h-[55vh] min-h-[300px] md:h-[calc(100vh-280px)]">
            <MarkdownEditor value={state.sourceText} onChange={setText} />
          </div>

          {state.mode === 'xiaohongshu' && (
            <div className="rounded-lg border bg-[var(--color-card)] p-3">
              <div className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
                水印配置（留空则不显示）
              </div>
              <WatermarkForm value={state.watermark} onChange={setWatermark} />
            </div>
          )}

          {/* 移动端：在编辑区底部也放一个「去预览」入口 */}
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] md:hidden"
            onClick={() => setMobileTab('preview')}
          >
            <Eye className="h-4 w-4" />
            查看预览
          </button>
        </div>

        {/* 右栏：卡片预览 */}
        <div className={cn(
          'flex flex-col rounded-lg border bg-[var(--color-muted)]/30',
          mobileTab === 'edit' && 'hidden md:flex',
        )}>
          {/* 移动端预览区顶部：返回编辑 + 导出 */}
          <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-[var(--color-muted-foreground)]"
              onClick={() => setMobileTab('edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
              返回编辑
            </button>
            <div className="ml-auto">
              <ExportButton onExport={handleExport} disabled={isEmpty} label="导出" />
            </div>
          </div>

          <div className="p-2">
            <CardRenderer
              mode={state.mode}
              text={state.sourceText}
              theme={state.theme}
              slideRatio={state.slideRatio}
              splitMode={state.splitMode}
              watermark={state.watermark}
              singleNodeRef={singleNodeRef}
              slideHandleRef={slideHandleRef}
            />
          </div>
        </div>
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
        { id: 'edit' as const, label: '编辑', icon: Pencil },
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

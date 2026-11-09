import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Check, RotateCcw, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { useAuth } from '@/lib/auth'
import { clearWorkbenchPreview, previewWorkbenchTheme, setWorkbenchTheme, useWorkbenchTheme, useWorkbenchMaterialStrength, CLASSIC_THEMES, workbenchThemeName, workbenchThemeStyle, isImmersiveSkin, type WorkbenchTheme } from '../lib/workbenchTheme'
import { SKIN_FAMILIES, skinFamily } from '../lib/artisticSkins'
import { WorkbenchSkinScene as ThemeScene } from './WorkbenchSkinScene'
import '../styles/workbench-theme.css'
import '../styles/skin-gallery.css'

export function WorkbenchThemePicker() {
  const selected = useWorkbenchTheme(), currentStrength = useWorkbenchMaterialStrength()
  const { user } = useAuth()
  return <ThemeEditor key={user?.userId ?? 'local'} selected={selected} currentStrength={currentStrength} userId={user?.userId} />
}

function ThemeEditor({ selected, currentStrength, userId }: { selected: WorkbenchTheme; currentStrength: number; userId?: number }) {
  const [candidate, setCandidate] = useState<WorkbenchTheme | null>(null)
  const [strength, setStrength] = useState(currentStrength)
  const [trial, setTrial] = useState(false)
  const [error, setError] = useState(false)
  const [grayscale, setGrayscale] = useState(false)
  const owner = useRef(Symbol('theme-trial')).current
  const lastOption = useRef<string | null>(null)
  const gallery = useRef<HTMLDivElement>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const galleryScroll = useRef(0)
  const previewOpen = candidate !== null
  useEffect(() => () => clearWorkbenchPreview(owner, userId), [owner, userId])
  useLayoutEffect(() => {
    if (previewOpen) {
      const dialog = previewHeading.current?.closest<HTMLElement>('[role="dialog"]')
      if (dialog) dialog.scrollTop = 0
      previewHeading.current?.focus({ preventScroll: true })
    } else if (lastOption.current) {
      const dialog = gallery.current?.closest<HTMLElement>('[role="dialog"]')
      if (dialog) dialog.scrollTop = galleryScroll.current
      gallery.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${lastOption.current}"]`)?.focus({ preventScroll: true })
    }
  }, [previewOpen])
  const restore = () => { clearWorkbenchPreview(owner, userId); setTrial(false) }
  const back = () => { restore(); setCandidate(null); setError(false) }
  const choose = (theme: WorkbenchTheme) => {
    galleryScroll.current = gallery.current?.closest<HTMLElement>('[role="dialog"]')?.scrollTop ?? 0
    lastOption.current = skinFamily(theme)?.id ?? theme
    setStrength(currentStrength); setCandidate(theme); setError(false)
  }
  const family = candidate ? skinFamily(candidate) : undefined
  if (candidate) return <div className="wb-theme-editor mt-3">
    <button type="button" className="wb-theme-action" onClick={back}><ArrowLeft size={16} />返回主题列表</button>
    <h3 ref={previewHeading} tabIndex={-1} className="mb-3 text-sm font-semibold outline-none">{workbenchThemeName(candidate)} · 聊天场景预览</h3>
    {family && <div role="group" aria-label={`${family.label}变体`} className="mb-3 flex flex-wrap gap-2">{family.variants.map(id =>
      <button key={id} type="button" aria-pressed={candidate === id} className="wb-theme-option wb-theme-action border" onClick={() => {
        setCandidate(id); setError(false); if (trial) previewWorkbenchTheme(owner, id, strength, userId)
      }}>{workbenchThemeName(id)}</button>)}</div>}
    {candidate !== 'inherit' || trial ? <ThemeScene theme={candidate} strength={strength} grayscale={grayscale} /> : <p className="my-4 text-sm">跟随平台的浅色、深色和材质设置。点击实时试用查看当前平台外观。</p>}
    {isImmersiveSkin(candidate) && <label className="my-3 flex min-h-11 items-center gap-3 text-sm">材质强度
      <input aria-label="材质强度" type="range" min="0" max="100" step="10" value={Math.round(strength * 100)} className="min-w-0 flex-1 accent-[var(--color-primary)]"
        onChange={event => { const value = Number(event.target.value) / 100; setStrength(value); if (trial) previewWorkbenchTheme(owner, candidate, value, userId) }} />
      <output className="w-10 text-right text-xs">{Math.round(strength * 100)}%</output>
    </label>}
    <p className="my-3 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{trial ? '正在当前工作台临时试用，关闭设置会恢复原外观。' : '预览不会更改当前工作台。'} 阅读密度和减少动效沿用原设置。</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="wb-theme-action border" onClick={() => { if (trial) restore(); else { previewWorkbenchTheme(owner, candidate, strength, userId); setTrial(true) } }}>{trial ? '恢复原主题' : '实时试用'}</button>
      <button type="button" className="wb-theme-action bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" onClick={() => {
        try { setWorkbenchTheme(candidate, userId, strength); restore(); setCandidate(null); setError(false) } catch { setError(true) }
      }}>保存主题</button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-[var(--color-danger)]">浏览器未允许保存，已保存的主题未更改。可恢复原主题后重试。</p>}
  </div>
  return <div ref={gallery} className="wb-theme-gallery mt-3 space-y-5" role="group" aria-label="工作台主题">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]"><span>当前：{workbenchThemeName(selected)}</span>
      <button type="button" className="wb-theme-action" title="恢复跟随全局外观，材质强度 60%" onClick={() => { try { setWorkbenchTheme('inherit', userId, .6); setError(false) } catch { setError(true) } }}><RotateCcw size={14} />恢复默认外观</button>
    </div>
    {error && <p role="alert" className="text-xs text-[var(--color-danger)]">浏览器未允许保存，已保存的主题未更改。</p>}
    <section aria-label="艺术皮肤">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">艺术皮肤 <span className="font-normal text-[var(--color-muted-foreground)]">· 4 种设计语言</span></h3>
        <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={grayscale} onChange={event => setGrayscale(event.target.checked)} />灰度比较</label></div>
      <div className="wb-theme-family-grid">{SKIN_FAMILIES.map(family => {
        const active = family.variants.some(id => id === selected)
        const variant = active ? selected : family.variants[0]
        return <button key={family.id} type="button" data-theme-option={family.id} aria-pressed={active} aria-label={family.name}
          onClick={() => choose(variant)} className="wb-theme-option wb-theme-family">
          <ThemeScene theme={variant} strength={currentStrength} thumbnail grayscale={grayscale} />
          <span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">{family.name}{active && <Check className="size-4 shrink-0" />}</span>
          <span className="mt-1 block text-xs">{family.label} · {active ? workbenchThemeName(selected) : '2 种变体'}</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">{family.description}</span>
        </button>
      })}</div>
    </section>
    <section aria-label="经典配色"><h3 className="mb-3 text-sm font-semibold">经典配色</h3><div className="grid grid-cols-2 gap-2">{CLASSIC_THEMES.map(theme =>
      <button key={theme.id} type="button" data-theme-option={theme.id} aria-pressed={selected === theme.id} aria-label={theme.name} onClick={() => choose(theme.id)} className="wb-theme-option flex min-h-14 min-w-0 items-center gap-2 rounded-md border border-[var(--color-border)] p-2 text-left text-xs">
        <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded"><span className="h-7 w-3" style={{ background: theme.colors[0] }} /><span className="h-7 w-3" style={{ background: theme.colors[7] }} /></span>
        <span className="min-w-0 flex-1 break-words">{theme.name}</span>{selected === theme.id && <Check className="size-4 shrink-0" />}
      </button>)}</div></section>
  </div>
}

export function WorkbenchThemeDialog({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: () => void }) {
  const theme = useWorkbenchTheme(), strength = useWorkbenchMaterialStrength()
  const portal = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content data-workbench-theme={theme === 'inherit' ? undefined : theme} style={workbenchThemeStyle(theme, strength)}
      onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
      className="fixed left-1/2 top-1/2 z-[60] max-h-[90dvh] w-[min(94vw,860px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[var(--color-foreground)]">
      <div className="flex items-center justify-between gap-2"><Dialog.Title className="text-base font-semibold">工作台主题</Dialog.Title>
        <Dialog.Close aria-label="关闭主题设置" className="flex size-11 items-center justify-center rounded-md hover:bg-[var(--color-muted)]"><X className="size-4" /></Dialog.Close></div>
      <Dialog.Description className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">先预览，再试用或保存。偏好按账号保存在此浏览器，不跨设备同步。</Dialog.Description>
      <WorkbenchThemePicker />
      <div className="mt-4 flex justify-end"><Dialog.Close className="wb-theme-action border border-[var(--color-border)]">关闭</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

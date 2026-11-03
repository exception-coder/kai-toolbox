import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowUp, Check, Mic, Plus, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { useAuth } from '@/lib/auth'
import { clearWorkbenchPreview, previewWorkbenchTheme, setWorkbenchTheme, useWorkbenchTheme, useWorkbenchMaterialStrength, CLASSIC_THEMES, IMMERSIVE_SKINS, workbenchThemeName, workbenchThemeStyle, isImmersiveSkin, type WorkbenchTheme } from '../lib/workbenchTheme'
import { AssistantReply } from './messages/AssistantReply'
import { ToolCallBubble } from './ToolCallBubble'
import { ArtisticSkinCover } from './ArtisticSkinCover'
import { ARTISTIC_SKINS } from '../lib/artisticSkins'
import '../styles/workbench-theme.css'

/** 复用消息与工具渲染器；示例不连接会话、引擎或任务。 */
function ThemeScene({ theme, strength, thumbnail = false }: { theme: WorkbenchTheme; strength: number; thumbnail?: boolean }) {
  return <div className={`wb-skin-scene ${thumbnail ? 'wb-skin-thumbnail' : ''}`} data-workbench-theme={theme === 'inherit' ? undefined : theme} style={workbenchThemeStyle(theme, strength)} aria-hidden={thumbnail || undefined}>
    <div className="wb-scene-header"><span>Forge / workspace</span><span>{thumbnail ? '•••' : '外观预览 · 演示数据'}</span></div>
    <div className="wb-scene-messages">
      <div className="wb-scene-user">让工作区更适合专注阅读。</div>
      <div className="wb-scene-author">Forge <span>09:41</span></div>
      {thumbnail ? <div className="wb-assistant-reply"><h3>让内容成为主角</h3><p>清晰的正文，安静的材质。</p><pre>const focus = true</pre><div className="wb-tool-call">✓ 已完成文件检查</div></div>
        : <><AssistantReply text={'### 让内容成为主角\n\n保留清晰的层级，材质只提供轻微的阅读氛围。**任务、草稿和会话保持不变。**\n\n- 消息自然展开\n- 代码与工具结果保持结构\n\n```ts\nconst focus = true\n```'} />
          <ToolCallBubble toolName="Read" input={{ file: 'src/workspace.ts' }} output="已读取示例文件；未执行真实任务。" />
          <div className="wb-scene-panel"><strong>面板表面 · 示例</strong>消息、代码与浮层使用同一套材质语言。</div></>}
    </div>
    <div className="mobile-composer-card wb-scene-composer"><span>输入消息…</span><div aria-hidden="true"><Plus size={16} /><Mic size={16} /><span className="wb-scene-send"><ArrowUp size={16} /></span></div></div>
  </div>
}

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
  const owner = useRef(Symbol('theme-trial')).current
  const lastOption = useRef<WorkbenchTheme | null>(null)
  const gallery = useRef<HTMLDivElement>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => clearWorkbenchPreview(owner, userId), [owner, userId])
  useEffect(() => {
    if (candidate) previewHeading.current?.focus({ preventScroll: true })
    else if (lastOption.current) gallery.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${lastOption.current}"]`)?.focus({ preventScroll: true })
  }, [candidate])
  const restore = () => { clearWorkbenchPreview(owner, userId); setTrial(false) }
  const back = () => { restore(); setCandidate(null); setError(false) }
  const choose = (theme: WorkbenchTheme) => { lastOption.current = theme; setStrength(currentStrength); setCandidate(theme); setError(false) }
  if (candidate) return <div className="wb-theme-editor mt-3">
    <button type="button" className="wb-theme-action" onClick={back}><ArrowLeft size={16} />返回主题列表</button>
    <h3 ref={previewHeading} tabIndex={-1} className="mb-3 text-sm font-semibold outline-none">{workbenchThemeName(candidate)} · 聊天场景预览</h3>
    {candidate !== 'inherit' || trial ? <ThemeScene theme={candidate} strength={strength} /> : <p className="my-4 text-sm">跟随平台的浅色、深色和材质设置。点击实时试用查看当前平台外观。</p>}
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
  return <div ref={gallery} className="mt-3 space-y-5" role="group" aria-label="工作台主题">
    {([{ title: '艺术皮肤', options: ARTISTIC_SKINS }, { title: '沉浸皮肤', options: IMMERSIVE_SKINS }, { title: '经典配色', options: CLASSIC_THEMES }] as const).map(group => <section key={group.title}>
      <h3 className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">{group.title}</h3>
      <div className="grid grid-cols-2 gap-3">{group.options.map(theme => <button key={theme.id} type="button" data-theme-option={theme.id} aria-pressed={selected === theme.id} aria-label={theme.name}
        onClick={() => choose(theme.id)} className="wb-theme-option min-w-0 overflow-hidden rounded-lg border border-[var(--color-border)] p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        {ARTISTIC_SKINS.some(skin => skin.id === theme.id) ? <ArtisticSkinCover theme={theme.id} strength={currentStrength} /> : <ThemeScene theme={theme.id} strength={currentStrength} thumbnail />}
        <span className="mt-2 flex min-w-0 items-center justify-between gap-1 text-xs font-semibold"><span>{theme.name}</span>{selected === theme.id && <Check className="size-4 shrink-0" />}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">{theme.description}</span>
      </button>)}</div>
    </section>)}
    <button type="button" data-theme-option="inherit" aria-pressed={selected === 'inherit'} onClick={() => choose('inherit')} className="wb-theme-option min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 text-left text-sm">跟随全局外观{selected === 'inherit' && <Check className="ml-2 inline size-4" />}</button>
  </div>
}

export function WorkbenchThemeDialog({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: () => void }) {
  const theme = useWorkbenchTheme(), strength = useWorkbenchMaterialStrength()
  const portal = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content data-workbench-theme={theme === 'inherit' ? undefined : theme} style={workbenchThemeStyle(theme, strength)}
      onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
      className="fixed left-1/2 top-1/2 z-[60] max-h-[90dvh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[var(--color-foreground)]">
      <div className="flex items-center justify-between gap-2"><Dialog.Title className="text-base font-semibold">工作台主题</Dialog.Title>
        <Dialog.Close aria-label="关闭主题设置" className="flex size-11 items-center justify-center rounded-md hover:bg-[var(--color-muted)]"><X className="size-4" /></Dialog.Close></div>
      <Dialog.Description className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">先预览，再试用或保存。偏好按账号保存在此浏览器，不跨设备同步。</Dialog.Description>
      <WorkbenchThemePicker />
      <div className="mt-4 flex justify-end"><Dialog.Close className="wb-theme-action border border-[var(--color-border)]">关闭</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { setRecentSessionsExpanded, useRecentSessionsExpanded } from '../lib/workspacePreferences'
import { setToolColors, useToolColors } from '../lib/toolColorPref'
import { setSkin, useSkin } from '../lib/skinPref'
import { setHideToolCalls, useHideToolCalls } from '../lib/toolVisibilityPref'

export function WorkspacePreferences({ open, onOpenChange, gestureEnabled, onToggleGesture }: {
  open: boolean; onOpenChange: (open: boolean) => void
  gestureEnabled?: boolean; onToggleGesture?: () => void
}) {
  const expanded = useRecentSessionsExpanded()
  const colors = useToolColors()
  const skin = useSkin()
  const hiddenTools = useHideToolCalls()
  const [error, setError] = useState(false)
  const portal = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-5">
      <Dialog.Title className="text-base font-semibold">工作区个性化</Dialog.Title>
      <Dialog.Description className="mt-2 text-xs text-[var(--color-muted-foreground)]">保存在当前浏览器，重新打开页面后仍生效，不修改项目或其他同事的设置。</Dialog.Description>
      <section aria-labelledby="preferences-layout" className="mt-5">
      <h2 id="preferences-layout" className="text-xs font-semibold text-[var(--color-muted-foreground)]">布局与导航</h2>
      <label className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-3 text-sm">
        <span>最近会话默认状态</span>
        <select aria-label="最近会话默认状态" value={String(expanded)} className="min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3"
          onChange={event => {
            try { setRecentSessionsExpanded(event.target.value === 'true'); setError(false) } catch { setError(true) }
          }}>
          <option value="true">展开</option><option value="false">折叠</option>
        </select>
      </label>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">修改立即应用；仍可点击“最近会话”标题临时展开或收起。</p>
      </section>
      <section aria-labelledby="preferences-reading" className="mt-5 border-t border-[var(--color-border)] pt-4">
        <h2 id="preferences-reading" className="text-xs font-semibold text-[var(--color-muted-foreground)]">阅读与外观</h2>
        <PreferenceToggle label="炫彩皮肤" hint="工作区使用当前引擎的背景效果。" checked={skin} onChange={setSkin} />
        <PreferenceToggle label="工具着色" hint="按命令、读写、子代理、技能和 MCP 区分颜色。" checked={colors} onChange={setToolColors} />
        <PreferenceToggle label="隐藏工具调用" hint="只隐藏消息流中的工具气泡，不停止执行；轨迹仍可查看。" checked={hiddenTools} onChange={setHideToolCalls} />
      </section>
      {onToggleGesture && <section aria-labelledby="preferences-interaction" className="mt-5 border-t border-[var(--color-border)] pt-4">
        <h2 id="preferences-interaction" className="text-xs font-semibold text-[var(--color-muted-foreground)]">交互偏好</h2>
        <PreferenceToggle label="手势控制" hint="需要摄像头授权；握拳弹出悬浮窗，张手返回，仅在本模块生效。" checked={Boolean(gestureEnabled)} onChange={onToggleGesture} />
      </section>}
      {error && <p role="alert" className="mt-3 text-xs text-amber-700">浏览器未允许保存，设置未更改。请允许本地存储后重试。</p>}
      <div className="mt-4 flex justify-end"><Dialog.Close className="min-h-11 rounded-md border border-[var(--color-border)] px-4 text-sm">完成</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

function PreferenceToggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void
}) {
  return <label className="mt-3 flex min-h-11 cursor-pointer items-start justify-between gap-4 text-sm">
    <span><span className="block">{label}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">{hint}</span></span>
    <input type="checkbox" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]" />
  </label>
}

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { PrdClarifyMode, PrdReqType } from '../../types'
import { REQ_TYPE_CONFIG } from '../../lib/requirementTypePresentation'

export type ClarifyEngine = 'claude' | 'codex'

/** 「开始探索」确认弹框：只保留需求类型和执行引擎。 */
export function StartClarifyDialog({
  showRequirementType = true,
  showEngineToggle = false,
  onConfirm,
  onClose,
}: {
  /** false 时隐藏需求类型，交由后端按需求内容判定。 */
  showRequirementType?: boolean
  showEngineToggle?: boolean
  onConfirm: (reqType: PrdReqType | undefined, maxQuestions: number | undefined, clarifyMode: PrdClarifyMode, engine: ClarifyEngine) => void
  onClose: () => void
}) {
  const [reqType, setReqType] = useState<PrdReqType>('NEW_MODULE')
  const [engine, setEngine] = useState<ClarifyEngine>('claude')
  const dialogRef = useRef<HTMLDivElement>(null)
  const primaryActionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    primaryActionRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      {/* 移动端小屏（尤其展开需求类型+深度+方式三节时）内容会超一屏，整卡限高可滚 */}
      <div
        ref={dialogRef}
        aria-labelledby="start-discovery-title"
        aria-modal="true"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl"
        role="dialog"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 id="start-discovery-title" className="font-semibold text-sm">开始探索前确认</h3>
          <button aria-label="关闭开始探索确认" onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {showRequirementType && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">这是什么类型的需求？</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(REQ_TYPE_CONFIG) as PrdReqType[]).map((t) => {
                const cfg = REQ_TYPE_CONFIG[t]
                const active = reqType === t
                const Icon = cfg.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReqType(t)}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active ? cfg.bg : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? cfg.color : 'text-[var(--color-muted-foreground)]'}`} />
                    <div>
                      <div className={`text-sm font-semibold ${active ? cfg.color : 'text-[var(--color-foreground)]'}`}>{cfg.label}</div>
                      <div className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">{cfg.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {showEngineToggle && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
                执行引擎
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'claude', label: 'Claude Code' },
                  { value: 'codex', label: 'Codex' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEngine(option.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      engine === option.value
                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30"
            >
              取消
            </button>
            <button
              ref={primaryActionRef}
              onClick={() => onConfirm(
                showRequirementType ? reqType : undefined,
                undefined,
                'progressive',
                engine,
              )}
              className="px-4 py-1.5 rounded-md text-sm bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              开始探索
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

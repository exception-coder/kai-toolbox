import { useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronDown, ChevronRight, Link2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { subscribeSse } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import { symlinkEventsPath } from '../api'
import type { NodeView } from '../types'

export interface SymlinkDialogProps {
  open: boolean
  node: NodeView | null
  onCancel: () => void
  onConfirm: (target: string, taskId: string) => Promise<void>
}

interface ProgressEvent {
  phase?: string
  message?: string
  current?: string
}

const PHASE_LABEL: Record<string, string> = {
  preparing: '准备中',
  moving: '跨盘移动数据',
  linking: '创建联接',
  rollback: '回滚移动',
  done: '完成',
}

/**
 * Suggest a target path on the D: drive that mirrors the source's structure. If the source
 * is already on D:, fall back to E: so the default is never the same as the source. Users
 * can freely edit it — this is just the pre-filled value.
 */
function suggestTargetPath(sourcePath: string): string {
  const m = sourcePath.match(/^([A-Za-z]):([\\/])(.*)$/)
  if (!m) return sourcePath
  const [, drive, sep, rest] = m
  const targetDrive = drive.toUpperCase() === 'D' ? 'E' : 'D'
  return `${targetDrive}:${sep}${rest}`
}

function newTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'symlink-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
}

/**
 * Robocopy errors can be thousands of characters of file paths. Show only the headline part
 * (everything before the first " | ") in the collapsed view; "查看详情" reveals the rest.
 */
function summarizeError(raw: string): string {
  const idx = raw.indexOf(' | ')
  const head = idx > 0 ? raw.slice(0, idx) : raw
  const MAX = 200
  if (head.length <= MAX) return head
  return head.slice(0, MAX) + '…'
}

function hasErrorDetails(raw: string): boolean {
  return raw.length > summarizeError(raw).length
}

export function SymlinkDialog({ open, node, onCancel, onConfirm }: SymlinkDialogProps) {
  const defaultTarget = useMemo(() => (node ? suggestTargetPath(node.path) : ''), [node])
  const [target, setTarget] = useState(defaultTarget)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorExpanded, setErrorExpanded] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null)
  const [currentLine, setCurrentLine] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const closeSseRef = useRef<(() => void) | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setTarget(defaultTarget)
      setError(null)
      setErrorExpanded(false)
      setPending(false)
      setPhase(null)
      setPhaseMessage(null)
      setCurrentLine(null)
      setElapsedSec(0)
    }
  }, [open, defaultTarget])

  // Tick once a second while pending so the user sees the operation isn't frozen.
  useEffect(() => {
    if (!pending || startTimeRef.current == null) return
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [pending])

  useEffect(() => {
    return () => {
      closeSseRef.current?.()
      closeSseRef.current = null
    }
  }, [])

  if (!node) return null

  const trimmed = target.trim()
  const canSubmit = !!trimmed && trimmed !== node.path && !pending

  const handleSubmit = async () => {
    if (!canSubmit) return
    const taskId = newTaskId()
    setError(null)
    setPending(true)
    setPhase('preparing')
    setPhaseMessage('正在建立连接…')
    setCurrentLine(null)
    startTimeRef.current = Date.now()
    setElapsedSec(0)

    closeSseRef.current?.()
    closeSseRef.current = subscribeSse(symlinkEventsPath(taskId), {
      onEvent: (name, data) => {
        if (name === 'progress') {
          const evt = data as ProgressEvent
          if (evt.phase) setPhase(evt.phase)
          if (evt.message) setPhaseMessage(evt.message)
          if (evt.current) setCurrentLine(evt.current)
        } else if (name === 'completed') {
          setPhase('done')
          setPhaseMessage('完成')
        } else if (name === 'error') {
          const msg = (data as { message?: string })?.message
          if (msg) setPhaseMessage(msg)
        }
      },
    })

    // Give the EventSource a tick to actually open before kicking off the POST,
    // otherwise the very first "preparing" event from the server may fire into the void.
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      await onConfirm(trimmed, taskId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    } finally {
      closeSseRef.current?.()
      closeSseRef.current = null
    }
  }

  const phaseLabel = phase ? PHASE_LABEL[phase] ?? phase : null
  const elapsedDisplay = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}分${(elapsedSec % 60).toString().padStart(2, '0')}秒`
    : `${elapsedSec}秒`

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={o => {
        if (!o && !pending) onCancel()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50 transition-opacity duration-150',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(92vw,560px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-lg border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-lg',
            'p-5 transition-all duration-150',
            'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
            'data-[state=open]:scale-100 data-[state=open]:opacity-100',
            'focus:outline-none',
          )}
          onEscapeKeyDown={() => {
            if (!pending) onCancel()
          }}
        >
          <div className="flex min-h-0 flex-1 items-start gap-3 overflow-y-auto pr-1">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Link2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-base font-semibold">
                  移动目录并创建软链接
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-[var(--color-muted-foreground)]">
                  把目录搬到目标位置，然后在原位置创建一个指向新位置的目录联接（Junction），原路径仍然可访问。
                </DialogPrimitive.Description>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="text-xs text-[var(--color-muted-foreground)]">源目录</div>
                <div className="break-all rounded-md border bg-[var(--color-muted)]/30 px-2.5 py-1.5 font-mono text-xs">
                  {node.path}
                </div>
                <div className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
                  当前大小 {formatBytes(node.size)}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <label htmlFor="symlink-target" className="text-xs text-[var(--color-muted-foreground)]">
                  目标路径（可修改）
                </label>
                <Input
                  id="symlink-target"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={pending}
                  className="font-mono text-xs"
                />
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  默认按源路径换到 D 盘。目标路径不能已存在；父目录会自动创建。
                </div>
              </div>

              {pending ? (
                <div className="space-y-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-primary)]" />
                    <span className="font-medium text-[var(--color-foreground)]">
                      {phaseLabel ?? '执行中'}
                    </span>
                    <span className="ml-auto tabular-nums text-[var(--color-muted-foreground)]">
                      {elapsedDisplay}
                    </span>
                  </div>
                  {phaseMessage && (
                    <div className="break-all text-[var(--color-muted-foreground)]">{phaseMessage}</div>
                  )}
                  {currentLine && (
                    <div className="break-all rounded bg-[var(--color-muted)]/40 px-2 py-1 font-mono text-[10.5px] leading-snug text-[var(--color-muted-foreground)]">
                      {currentLine}
                    </div>
                  )}
                  <div className="text-[10.5px] text-[var(--color-muted-foreground)]">
                    跨盘搬数据是按文件复制后再删除原文件，几 GB 的目录通常需要几十秒到数分钟，请耐心等候。
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  <div className="font-medium">⚠ 注意</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>跨盘移动用 <code className="font-mono">robocopy /E /MOVE</code>，大目录会复制后再删除，可能耗时较长。</li>
                    <li>原位置创建的是 NTFS 联接（<code className="font-mono">mklink /J</code>），不需要管理员权限，仅支持本机 NTFS 卷。</li>
                    <li>移动前请先关闭占用该目录的程序（如 Ollama、Docker 等），否则会因文件被占用而失败（失败会自动回滚）。</li>
                    <li>谨慎对系统关键目录使用，链接异常可能导致软件失效。</li>
                  </ul>
                </div>
              )}

              {error && (
                <div className="overflow-hidden rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 text-xs text-[var(--color-destructive)]">
                  <div className="px-3 py-2">
                    <div className="break-words">{summarizeError(error)}</div>
                    {hasErrorDetails(error) && (
                      <button
                        type="button"
                        onClick={() => setErrorExpanded(v => !v)}
                        className="mt-1.5 inline-flex items-center gap-1 rounded text-[10.5px] underline-offset-2 hover:underline"
                      >
                        {errorExpanded ? (
                          <>
                            <ChevronDown className="h-3 w-3" /> 收起详情
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3 w-3" /> 查看详情
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {errorExpanded && hasErrorDetails(error) && (
                    <pre className="max-h-48 overflow-auto border-t border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-3 py-2 font-mono text-[10.5px] leading-snug whitespace-pre-wrap break-all">
                      {error}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex shrink-0 items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
              取消
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {pending ? '执行中…' : '移动并创建软链接'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

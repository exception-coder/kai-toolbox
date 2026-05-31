import { useEffect, useState } from 'react'
import { Loader2, PlayCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import type { ParamSpec } from '../types'

interface Props {
  taskName: string
  params: ParamSpec[]
  pending: boolean
  error?: string | null
  onConfirm: (values: Record<string, unknown>) => void
  onCancel: () => void
}

/**
 * 回放前弹出的填变量表单。kind 控制 input 类型（number / checkbox / text），
 * defaultValue 作为初始值。提交时按 kind 转型。
 */
export function ReplayFormDialog({ taskName, params, pending, error, onConfirm, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of params) init[p.name] = p.defaultValue ?? ''
    return init
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = () => {
    const out: Record<string, unknown> = {}
    for (const p of params) {
      const raw = values[p.name] ?? ''
      if (p.kind === 'number') {
        const n = Number(raw)
        out[p.name] = Number.isFinite(n) ? n : raw
      } else if (p.kind === 'boolean') {
        out[p.name] = raw === 'true'
      } else {
        out[p.name] = raw
      }
    }
    onConfirm(out)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <Card className="w-[min(92vw,520px)]" onClick={e => e.stopPropagation()}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <PlayCircle className="size-5 text-[var(--color-primary)]" />
            <div className="flex-1">
              <div className="font-medium">回放 {taskName}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">填写参数后点确认</div>
            </div>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="size-4" />
            </Button>
          </div>

          {params.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
              此任务没有声明参数，直接回放即可。
            </div>
          )}

          <ul className="space-y-2">
            {params.map(p => (
              <li key={p.name}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <code className="rounded bg-[var(--color-muted)] px-1 font-mono">{p.name}</code>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">{p.kind}</span>
                </div>
                {p.kind === 'boolean' ? (
                  <select
                    className="w-full rounded-md border bg-[var(--color-background)] p-2 text-sm"
                    value={values[p.name]}
                    onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    type={p.kind === 'number' ? 'number' : 'text'}
                    value={values[p.name] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))}
                    placeholder={p.defaultValue ?? ''}
                  />
                )}
              </li>
            ))}
          </ul>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>取消</Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              确认回放
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

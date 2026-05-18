import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { evalJsonPath, stringifyForVar } from '../utils/jsonpath'

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * JSONPath 选择器对话框：给定一个响应 JSON 文本，让用户「点着选」path。
 * 与 ExtractVarDialog 区别：本组件只负责挑 path，不直接落库——通过 onPick 回调把 path 字符串
 * 返回给上层（用于 OutputsEditor 行内填值）。
 */
export function PathPickerDialog({
  body, initialPath = '$', onPick, onClose,
}: {
  body: string
  initialPath?: string
  onPick: (path: string) => void
  onClose: () => void
}) {
  const [path, setPath] = useState(initialPath)

  const parsed = useMemo<{ ok: true; data: unknown } | { ok: false; err: string }>(() => {
    try { return { ok: true, data: JSON.parse(body) } }
    catch (e) { return { ok: false, err: (e as Error).message } }
  }, [body])

  const value = useMemo(() => {
    if (!parsed.ok) return undefined
    return evalJsonPath(parsed.data, path)
  }, [parsed, path])

  const valueStr = stringifyForVar(value)

  /** 当前 path 求值结果的下一级可达路径，跟 ExtractVarDialog 同款逻辑。 */
  const suggestions = useMemo<Array<{ path: string; preview: string; isLeaf: boolean }>>(() => {
    if (value == null || typeof value !== 'object') return []
    const trimmed = path.trim()
    const base = trimmed === '' ? '$' : trimmed
    if (Array.isArray(value)) {
      const cap = Math.min(value.length, 20)
      const out: Array<{ path: string; preview: string; isLeaf: boolean }> = []
      for (let i = 0; i < cap; i++) {
        const v = value[i]
        out.push({
          path: `${base}[${i}]`,
          preview: stringifyForVar(v).slice(0, 80),
          isLeaf: v == null || typeof v !== 'object',
        })
      }
      return out
    }
    return Object.entries(value).slice(0, 50).map(([k, v]) => ({
      path: VAR_NAME_RE.test(k) ? `${base}.${k}` : `${base}["${k.replace(/"/g, '\\"')}"]`,
      preview: stringifyForVar(v).slice(0, 80),
      isLeaf: v == null || typeof v !== 'object',
    }))
  }, [value, path])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}>
      <div className="w-[min(92vw,640px)] space-y-3 rounded-lg border bg-[var(--color-card)] p-5 shadow-lg"
           onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <div className="text-base font-semibold">选择 JSONPath</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            根据响应样本逐层钻取，或直接手敲。点候选自动填入路径。
          </div>
        </div>

        {!parsed.ok && (
          <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
            响应样本不是合法 JSON：{parsed.err}。仍可手敲 JSONPath，确定后回到 outputs。
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium">路径</label>
          <Input value={path} onChange={e => setPath(e.target.value)} autoFocus />
          {suggestions.length > 0 && (
            <div className="rounded border bg-[var(--color-muted)]/40 p-1.5">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                下一级（点击补全）
              </div>
              <div className="max-h-48 overflow-auto">
                {suggestions.map(s => (
                  <button
                    key={s.path}
                    type="button"
                    onClick={() => setPath(s.path)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--color-accent)]"
                  >
                    <code className="shrink-0 font-mono text-xs">{s.path.slice(path.trim().length || 1)}</code>
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">
                      {s.preview}
                    </span>
                    {s.isLeaf && <Badge variant="outline" className="shrink-0">叶子</Badge>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">当前求值结果</label>
          <pre className="max-h-32 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs">
{value === undefined
  ? '(undefined — 路径不存在或响应非 JSON)'
  : valueStr || '(空字符串)'}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={() => { onPick(path); onClose() }}
                  disabled={!path.trim()}>
            选定
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrainCircuit, Plus } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  addMemory, confirmMemory, deleteMemory, listMemory, updateMemory,
  type MemoryView,
} from '../lib/api'
import { MemoryCard } from '../components/MemoryCard'

const CATEGORIES = [
  { value: 'PREFERENCE', label: '偏好' },
  { value: 'BOUNDARY', label: '禁区' },
  { value: 'PERSON', label: '核心人物' },
]

/** 用户画像 / 长期记忆面板：待确认（LLM 提议）+ 已生效（按类目）+ 手动新增。 */
export function ProfilePage() {
  const confirm = useConfirm()
  const [active, setActive] = useState<MemoryView[]>([])
  const [proposed, setProposed] = useState<MemoryView[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 手动新增表单
  const [cat, setCat] = useState('PREFERENCE')
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [detail, setDetail] = useState('')

  const reload = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([listMemory('active'), listMemory('proposed')])
      setActive(a)
      setProposed(p)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); await reload() }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setBusy(false) }
  }, [reload])

  const add = () => {
    if (!key.trim() || !value.trim()) return
    void run(async () => {
      await addMemory({ category: cat, key: key.trim(), value: value.trim(), detail: detail.trim() || undefined })
      setKey(''); setValue(''); setDetail('')
    })
  }

  const askDelete = async (m: MemoryView, ignore: boolean) => {
    const ok = await confirm({
      title: ignore ? '忽略提议' : '删除记忆',
      description: ignore ? `忽略「${m.key}」这条提议？` : `删除「${m.key}：${m.value}」？此操作不可撤销。`,
    })
    if (ok) void run(() => deleteMemory(m.id))
  }

  const byCat = (c: string) => active.filter(m => m.category === c)

  return (
    <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-5 px-4 py-5">
      <header className="flex items-center gap-2">
        <BrainCircuit className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">用户画像 / 长期记忆</h1>
        <div className="ml-auto flex gap-3 text-sm">
          <Link to="/tools/ai-secretary" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">记录</Link>
          <Link to="/tools/ai-secretary/ask" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">回忆</Link>
        </div>
      </header>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        记忆由 AI 从你的记录/对话中<strong>提议</strong>，确认后才生效并注入；偏好/禁区/核心人物在记录与回忆时作为背景参考。「近期重要事项」由待办/日程自动派生，无需在此维护。
      </p>

      {error && <div className="rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]">{error}</div>}

      {/* 手动新增 */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={cat} onChange={e => setCat(e.target.value)}
            className="rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="键（如 口味 / 老板）"
            className="w-32 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm" />
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="内容"
            className="min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm" />
          <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="备注（可空）"
            className="w-32 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm" />
          <button type="button" onClick={add} disabled={busy || !key.trim() || !value.trim()}
            className="flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm text-[var(--color-primary-foreground)] disabled:opacity-50">
            <Plus className="size-4" /> 新增
          </button>
        </div>
      </section>

      {/* 待确认 */}
      {proposed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">待确认（AI 提议 {proposed.length}）</h2>
          {proposed.map(m => (
            <MemoryCard key={m.id} m={m} busy={busy}
              onConfirm={() => run(() => confirmMemory(m.id))}
              onSaveValue={v => run(() => updateMemory(m.id, { value: v }))}
              onDelete={() => askDelete(m, true)} />
          ))}
        </section>
      )}

      {/* 已生效，按类目 */}
      {CATEGORIES.map(c => {
        const items = byCat(c.value)
        if (items.length === 0) return null
        return (
          <section key={c.value} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{c.label}（{items.length}）</h2>
            {items.map(m => (
              <MemoryCard key={m.id} m={m} busy={busy}
                onTogglePin={() => run(() => updateMemory(m.id, { pinned: !m.pinned }))}
                onSaveValue={v => run(() => updateMemory(m.id, { value: v }))}
                onDelete={() => askDelete(m, false)} />
            ))}
          </section>
        )
      })}

      {active.length === 0 && proposed.length === 0 && (
        <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
          还没有记忆。多记几条、多问几次，AI 会逐渐提议你的偏好 / 禁区 / 核心人物。
        </div>
      )}
    </div>
  )
}

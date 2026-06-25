import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getConfigBlock,
  listConfigBlocks,
  resetConfigBlock,
  updateConfigBlock,
  type ConfigBlockView,
} from '../api'

const BLOCKS_KEY = ['config-blocks']

/** 运行时动态配置中心：选块 → 编辑有效值 → 保存（不重启生效）/ 重置回默认。 */
export function ConfigCenterPage() {
  const qc = useQueryClient()
  const { data: blocksData } = useQuery({ queryKey: BLOCKS_KEY, queryFn: listConfigBlocks })
  const blocks = blocksData?.blocks ?? []

  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (selected === null && blocks.length > 0) setSelected(blocks[0].id)
  }, [blocks, selected])

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      <aside className="w-60 shrink-0 overflow-y-auto border-r">
        <div className="px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)]">可刷新配置块</div>
        {blocks.length === 0 && (
          <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
            暂无配置块（给 @ConfigurationProperties 加 @Refreshable 即纳入）
          </div>
        )}
        <ul>
          {blocks.map(b => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelected(b.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  b.id === selected ? 'bg-[var(--color-accent)] font-medium' : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                <div className="truncate">{b.name}</div>
                <div className="truncate text-xs text-[var(--color-muted-foreground)]">{b.id}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex-1 overflow-y-auto p-4">
        {selected ? <BlockEditor blockId={selected} onChanged={() => qc.invalidateQueries({ queryKey: BLOCKS_KEY })} /> : null}
      </main>
    </div>
  )
}

function BlockEditor({ blockId, onChanged }: { blockId: string; onChanged: () => void }) {
  const qc = useQueryClient()
  const key = ['config-block', blockId]
  const { data: block, isPending } = useQuery({ queryKey: key, queryFn: () => getConfigBlock(blockId) })

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [listDraft, setListDraft] = useState<Record<string, string[]>>({})
  const entries = block ? normalizeEntries(block.entries) : []
  useEffect(() => {
    if (!block) return
    const nextEntries = normalizeEntries(block.entries)
    setDraft(Object.fromEntries(nextEntries.filter(e => !isListEntry(e)).map(e => [e.key, e.value ?? ''])))
    setListDraft(Object.fromEntries(nextEntries.filter(isListEntry).map(e => [e.key, e.values ?? []])))
  }, [block])

  const applyResult = (updated: ConfigBlockView) => {
    qc.setQueryData(key, updated)
    onChanged()
  }

  const save = useMutation({
    mutationFn: () => {
      const changed: Record<string, string> = {}
      const replacePrefixes: string[] = []
      entries.forEach(e => {
        if (isListEntry(e)) {
          const cur = normalizeList(listDraft[e.key] ?? [])
          const prev = normalizeList(e.values ?? [])
          if (!sameList(cur, prev)) {
            replacePrefixes.push(e.key)
            if (cur.length === 0) {
              changed[e.key] = ''
            } else {
              cur.forEach((value, index) => {
                changed[`${e.key}[${index}]`] = value
              })
            }
          }
          return
        }
        const cur = draft[e.key] ?? ''
        if (cur !== (e.value ?? '')) {
          changed[e.key] = cur
        }
      })
      return updateConfigBlock(blockId, changed, replacePrefixes)
    },
    onSuccess: applyResult,
  })

  const reset = useMutation({
    mutationFn: () => resetConfigBlock(blockId),
    onSuccess: applyResult,
  })

  if (isPending || !block) {
    return <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
  }

  const dirty = entries.some(e => {
    if (isListEntry(e)) {
      return !sameList(normalizeList(listDraft[e.key] ?? []), normalizeList(e.values ?? []))
    }
    return (draft[e.key] ?? '') !== (e.value ?? '')
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div>
          <h2 className="text-base font-semibold">{block.name}</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">{block.id}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
            <RotateCcw className="size-4" /> 重置默认
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="size-4" /> 保存
          </Button>
        </div>
      </div>

      {save.isError && (
        <p className="text-sm text-[var(--color-destructive)]">
          保存失败：{(save.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">配置项</th>
              <th className="px-3 py-2 font-medium">值</th>
              <th className="w-20 px-3 py-2 font-medium">来源</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map(e => (
              <tr key={e.key}>
                <td className="px-3 py-3 align-top font-mono text-xs">
                  {e.key}
                  {e.description
                    ? <div className="mt-1 font-sans text-[11px] font-normal text-[var(--color-muted-foreground)]">{e.description}</div>
                    : null}
                </td>
                <td className="px-3 py-2 align-top">
                  {isListEntry(e) ? (
                    <ListValueEditor
                      values={listDraft[e.key] ?? []}
                      onChange={values => setListDraft(d => ({ ...d, [e.key]: values }))}
                    />
                  ) : (
                    <input
                      className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
                      value={draft[e.key] ?? ''}
                      onChange={ev => setDraft(d => ({ ...d, [e.key]: ev.target.value }))}
                    />
                  )}
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  {e.overridden
                    ? <span className="text-[var(--color-primary)]">覆盖</span>
                    : <span className="text-[var(--color-muted-foreground)]">默认</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListValueEditor({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const items = values.length === 0 ? [''] : values
  return (
    <div className="space-y-2">
      {items.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
            value={value}
            onChange={ev => {
              const next = [...items]
              next[index] = ev.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="删除"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ''])}>
        <Plus className="size-4" /> 添加
      </Button>
    </div>
  )
}

function isListEntry(entry: { type?: string }) {
  return entry.type === 'list'
}

function normalizeEntries(entries: ConfigBlockView['entries']) {
  if (entries.some(e => e.type === 'list')) {
    return entries
  }
  const indexed = new Map<string, { values: string[]; overridden: boolean }>()
  const indexedKeys = new Set<string>()
  entries.forEach(entry => {
    const parsed = parseIndexedKey(entry.key)
    if (!parsed) return
    const group = indexed.get(parsed.baseKey) ?? { values: [], overridden: false }
    group.values[parsed.index] = entry.value ?? ''
    group.overridden = group.overridden || entry.overridden
    indexed.set(parsed.baseKey, group)
    indexedKeys.add(entry.key)
  })

  const normalized: ConfigBlockView['entries'] = []
  entries.forEach(entry => {
    if (indexedKeys.has(entry.key)) return
    const group = indexed.get(entry.key)
    if (group) {
      normalized.push({ ...entry, type: 'list', values: compactIndexedValues(group.values), overridden: entry.overridden || group.overridden })
      indexed.delete(entry.key)
      return
    }
    if (isLegacyListKey(entry.key)) {
      normalized.push({ ...entry, type: 'list', values: entry.value ? [entry.value] : [] })
      return
    }
    normalized.push(entry)
  })
  indexed.forEach((group, baseKey) => {
    normalized.push({ key: baseKey, value: compactIndexedValues(group.values).join('\n'), overridden: group.overridden, type: 'list', values: compactIndexedValues(group.values) })
  })
  return normalized
}

function parseIndexedKey(key: string) {
  const match = /^(.*)\[(\d+)]$/.exec(key)
  if (!match) return null
  return { baseKey: match[1], index: Number(match[2]) }
}

function compactIndexedValues(values: string[]) {
  return values.filter(value => value != null)
}

function isLegacyListKey(key: string) {
  const name = key.split('.').at(-1) ?? ''
  return name === 'roots' || name === 'hidden-prefixes'
}

function normalizeList(values: string[]) {
  return values.map(v => v.trim()).filter(Boolean)
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

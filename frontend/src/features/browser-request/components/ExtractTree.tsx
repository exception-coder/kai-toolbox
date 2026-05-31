import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { fromTreePath, fromTreePathWildcard, type PathSeg } from '../utils/jsonpath'

interface Props {
  /** 响应体（已是 JSON 文本）；非 JSON 时给空字符串走 fallback。 */
  responseBody: string | null | undefined
  /** 用户点字段后回调：传 JSONPath 与默认变量名（叶子段名） */
  onPickPath: (jsonPath: string, defaultName: string) => void
  /** 已存在的抽取——叶子上根据 jsonPath 是否匹配显示一个变量名 badge，提示「这一项已经标过」 */
  existingExtracts?: { jsonPath: string; name: string }[]
}

/**
 * 响应体 JSON 树状视图。点叶子节点 → 弹小输入框命名 → 调 onPickPath 写入 step.extracts。
 */
export function ExtractTree({ responseBody, onPickPath, existingExtracts }: Props) {
  const parsed = useMemo(() => {
    if (!responseBody) return { ok: false as const }
    try { return { ok: true as const, value: JSON.parse(responseBody) } }
    catch { return { ok: false as const } }
  }, [responseBody])

  if (!parsed.ok) {
    return (
      <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
        响应体不是合法 JSON，无法用树状视图选字段。直接复制路径到下方手填 JSONPath。
      </div>
    )
  }

  // 把现有抽取扁平化成 jsonPath → varName 的快速查表
  const extractsByPath = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of existingExtracts ?? []) m.set(e.jsonPath, e.name)
    return m
  }, [existingExtracts])

  return (
    <div className="rounded-md border bg-[var(--color-card)] p-2 font-mono text-xs">
      <TreeNode value={parsed.value} path={[]} onPickPath={onPickPath} extractsByPath={extractsByPath} />
    </div>
  )
}

interface NodeProps {
  value: unknown
  path: PathSeg[]
  onPickPath: (jsonPath: string, defaultName: string) => void
  extractsByPath: Map<string, string>
}

function TreeNode({ value, path, onPickPath, extractsByPath }: NodeProps) {
  const [open, setOpen] = useState(path.length < 2)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(suggestNameFromPath(path))

  if (value === null) return <Leaf path={path} display="null" onPick={onPickPath} renaming={renaming} setRenaming={setRenaming} draft={draft} setDraft={setDraft} extractsByPath={extractsByPath} />
  if (typeof value === 'string') return <Leaf path={path} display={`"${truncate(value)}"`} onPick={onPickPath} renaming={renaming} setRenaming={setRenaming} draft={draft} setDraft={setDraft} extractsByPath={extractsByPath} />
  if (typeof value === 'number' || typeof value === 'boolean')
    return <Leaf path={path} display={String(value)} onPick={onPickPath} renaming={renaming} setRenaming={setRenaming} draft={draft} setDraft={setDraft} extractsByPath={extractsByPath} />
  // object / array
  const isArr = Array.isArray(value)
  const entries: [string, unknown][] = isArr
    ? (value as unknown[]).slice(0, 50).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)
  const more = isArr && (value as unknown[]).length > 50

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 hover:text-[var(--color-primary)]">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>{isArr ? `array · ${(value as unknown[]).length}` : `object · ${entries.length}`}</span>
      </button>
      {open && (
        <ul className="ml-3 border-l pl-2">
          {entries.map(([k, v]) => {
            const childPath = [...path, isArr ? Number(k) : k]
            return (
              <li key={k} className="flex gap-2">
                <span className="shrink-0 text-[var(--color-muted-foreground)]">
                  {isArr ? `[${k}]:` : `${k}:`}
                </span>
                <div className="min-w-0 flex-1">
                  <TreeNode value={v} path={childPath} onPickPath={onPickPath} extractsByPath={extractsByPath} />
                </div>
              </li>
            )
          })}
          {more && (
            <li className="text-[10px] text-[var(--color-muted-foreground)]">
              … 已截断到前 50 项
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function Leaf({
  path, display, onPick, renaming, setRenaming, draft, setDraft, extractsByPath,
}: {
  path: PathSeg[]
  display: string
  onPick: (jsonPath: string, defaultName: string) => void
  renaming: boolean
  setRenaming: (b: boolean) => void
  draft: string
  setDraft: (s: string) => void
  extractsByPath: Map<string, string>
}) {
  // 路径里有数组下标时，给用户「全数组项」选项：把 [N] 替换为 [*]
  const hasArrayIndex = path.some(seg => typeof seg === 'number')
  const [wildcard, setWildcard] = useState(false)
  const jsonPath = wildcard ? fromTreePathWildcard(path) : fromTreePath(path)
  // 已抽取标识：精确路径 OR 通配版本任一命中 existingExtracts 都算
  const exactPath = fromTreePath(path)
  const wildPath = hasArrayIndex ? fromTreePathWildcard(path) : null
  const matchedVarName = extractsByPath.get(exactPath) ?? (wildPath ? extractsByPath.get(wildPath) : undefined)
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(draft)
  if (renaming) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="text-[var(--color-muted-foreground)]">{display}</span>
        <Input
          className="h-6 w-32 text-xs"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value.trim())}
          onKeyDown={e => {
            if (e.key === 'Enter' && valid) { onPick(jsonPath, draft); setRenaming(false) }
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
        {hasArrayIndex && (
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]"
            title="勾上则抽取数组中所有项对应的此字段（JSONPath [*]），用于循环类后续步骤"
          >
            <input
              type="checkbox"
              checked={wildcard}
              onChange={e => setWildcard(e.target.checked)}
              className="size-3 accent-[var(--color-primary)]"
            />
            全数组项
          </label>
        )}
        <code className="rounded bg-[var(--color-muted)] px-1 font-mono text-[10px] text-[var(--color-muted-foreground)]" title="将存入此 JSONPath">
          {jsonPath}
        </code>
        <Button size="sm" variant="ghost" onClick={() => { if (valid) { onPick(jsonPath, draft); setRenaming(false) } }}>
          ✓
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>×</Button>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[var(--color-muted-foreground)]">{display}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1 text-[10px]"
        onClick={() => setRenaming(true)}
        title={`抽取 ${jsonPath} 为变量${hasArrayIndex ? '；点开后可勾「全数组项」转 [*]' : ''}`}
      >
        <Tag className="size-3" />
      </Button>
      {matchedVarName && (
        <Badge
          variant="secondary"
          className="h-4 gap-0.5 px-1 text-[10px] font-mono text-amber-700 dark:text-amber-300"
          title={`已抽取为 \${${matchedVarName}}`}
        >
          ✓ ${`{${matchedVarName}}`}
        </Badge>
      )}
    </span>
  )
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

function suggestNameFromPath(path: PathSeg[]): string {
  const last = path[path.length - 1]
  if (typeof last === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) return last
  // 找最近一个合法标识符
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i]
    if (typeof seg === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) return seg
  }
  return 'value'
}

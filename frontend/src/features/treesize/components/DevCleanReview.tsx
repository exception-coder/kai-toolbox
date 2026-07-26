import { useQuery } from '@tanstack/react-query'
import { ChevronDown, File, Folder, History, Loader2, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatBytes, formatNumber } from '@/lib/utils'
import { getDevCleanEntries, type DevCleanEntry, type DevCleanRecipe } from '../api'

export function DevCleanEntryDetails({ recipe }: { recipe: DevCleanRecipe }) {
  const detail = useQuery({
    queryKey: ['devclean-entries', recipe.id],
    queryFn: () => getDevCleanEntries(recipe.id),
    staleTime: 0,
  })

  if (detail.isLoading) {
    return (
      <div className="ml-7 mt-3 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在读取文件明细…
      </div>
    )
  }
  if (detail.isError) {
    return <div className="ml-7 mt-3 text-xs text-[var(--color-destructive)]">明细读取失败</div>
  }
  if (!detail.data) return null

  if (recipe.kind === 'VERSIONED_DIR' && detail.data.retainedCount > 0) {
    return (
      <VersionTree
        entries={detail.data.entries}
        retainedEntries={detail.data.retainedEntries}
        totalCount={detail.data.totalCount}
        truncated={detail.data.truncated}
      />
    )
  }

  return (
    <div className="ml-7 mt-3 overflow-hidden rounded-md border bg-[var(--color-muted)]/15">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="font-medium">本次会按整项移入回收站</span>
        <span className="text-[var(--color-muted-foreground)]">
          显示 {formatNumber(detail.data.returnedCount)} / {formatNumber(detail.data.totalCount)} 项
        </span>
      </div>
      <EntryList entries={detail.data.entries} />
      {detail.data.truncated && (
        <div className="border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          文件较多，仅展示体积最大的 500 项；清理范围仍是上方整个清理项。
        </div>
      )}
      {detail.data.entries.length === 0 && (
        <div className="px-3 py-4 text-xs text-[var(--color-muted-foreground)]">
          {recipe.title} 当前没有可清理内容。
        </div>
      )}
      {detail.data.retainedCount > 0 && (
        <>
          <div className="flex items-center justify-between border-y bg-[var(--color-success)]/8 px-3 py-2 text-xs">
            <span className="font-medium text-[var(--color-success)]">明确保留</span>
            <span className="text-[var(--color-muted-foreground)]">
              显示 {formatNumber(detail.data.retainedEntries.length)} /{' '}
              {formatNumber(detail.data.retainedCount)} 项
            </span>
          </div>
          <EntryList entries={detail.data.retainedEntries} retained />
          {detail.data.retainedTruncated && (
            <div className="border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              保留项较多，仅展示前 500 项。
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface VersionGroup {
  family: string
  retained: DevCleanEntry
  history: DevCleanEntry[]
}

function VersionTree({
  entries,
  retainedEntries,
  totalCount,
  truncated,
}: {
  entries: DevCleanEntry[]
  retainedEntries: DevCleanEntry[]
  totalCount: number
  truncated: boolean
}) {
  const { groups, unmatched } = useMemo(
    () => buildVersionGroups(entries, retainedEntries),
    [entries, retainedEntries],
  )

  return (
    <div className="ml-7 mt-3 overflow-hidden rounded-lg border bg-[var(--color-muted)]/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 text-xs">
        <div>
          <div className="font-semibold">版本保留核对</div>
          <div className="mt-0.5 text-[var(--color-muted-foreground)]">
            最新版作为父节点保留，展开可核对其历史待删版本
          </div>
        </div>
        <span className="rounded-full bg-[var(--color-destructive)]/10 px-2 py-1 text-[var(--color-destructive)]">
          待删 {formatNumber(totalCount)} 项
        </span>
      </div>
      <div className="max-h-[32rem] space-y-2 overflow-y-auto p-2">
        {groups.map(group => (
          <VersionNode key={group.retained.path} group={group} />
        ))}
        {unmatched.length > 0 && <UnmatchedVersions entries={unmatched} />}
      </div>
      {truncated && (
        <div className="border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          历史版本较多，仅展示体积最大的 500 项；实际清理范围仍按整个清理项执行。
        </div>
      )}
    </div>
  )
}

function VersionNode({ group }: { group: VersionGroup }) {
  const [expanded, setExpanded] = useState(group.history.length > 0)
  const historyBytes = group.history.reduce((sum, entry) => sum + entry.size, 0)

  return (
    <div className="overflow-hidden rounded-md border bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-muted)]/20"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-success)]/12 text-[var(--color-success)]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-xs font-semibold" title={group.retained.path}>
              {group.retained.name}
            </span>
            <span className="rounded-full bg-[var(--color-success)]/12 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
              最新版 · 保留
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--color-muted-foreground)]">
            {group.history.length > 0
              ? `${formatNumber(group.history.length)} 个历史版本 · ${formatBytes(historyBytes)} 待清理`
              : '没有历史版本需要清理'}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">
          {formatBytes(group.retained.size)}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && group.history.length > 0 && (
        <ul className="divide-y border-t bg-[var(--color-destructive)]/[0.025]">
          {group.history.map(entry => (
            <li key={entry.path} className="relative flex items-center gap-2 py-2 pl-12 pr-3 text-xs">
              <span className="absolute bottom-1/2 left-[1.55rem] top-0 w-px bg-[var(--color-border)]" />
              <span className="absolute left-[1.55rem] top-1/2 h-px w-3 bg-[var(--color-border)]" />
              <History className="h-3.5 w-3.5 shrink-0 text-[var(--color-destructive)]" />
              <span className="min-w-0 flex-1 truncate font-mono" title={entry.path}>
                {entry.name}
              </span>
              <span className="rounded-full bg-[var(--color-destructive)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-destructive)]">
                历史版 · 待删
              </span>
              <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">
                {formatBytes(entry.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UnmatchedVersions({ entries }: { entries: DevCleanEntry[] }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="overflow-hidden rounded-md border border-dashed bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-muted)]/20"
      >
        <History className="h-4 w-4 text-[var(--color-destructive)]" />
        <span className="flex-1 font-medium">未匹配到最新版的历史版本</span>
        <span className="text-[var(--color-muted-foreground)]">{formatNumber(entries.length)} 项</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <EntryList entries={entries} />}
    </div>
  )
}

function buildVersionGroups(
  entries: DevCleanEntry[],
  retainedEntries: DevCleanEntry[],
): { groups: VersionGroup[]; unmatched: DevCleanEntry[] } {
  const groups = retainedEntries.map(retained => ({
    family: versionFamily(retained.name),
    retained,
    history: [] as DevCleanEntry[],
  }))
  const byFamily = new Map(groups.map(group => [group.family, group]))
  const unmatched: DevCleanEntry[] = []

  entries.forEach(entry => {
    const group = byFamily.get(versionFamily(entry.name))
    if (group) group.history.push(entry)
    else unmatched.push(entry)
  })

  groups.forEach(group => group.history.sort(compareVersionNames))
  groups.sort((left, right) => {
    if (left.history.length !== right.history.length) return right.history.length - left.history.length
    return left.family.localeCompare(right.family, undefined, { numeric: true })
  })
  unmatched.sort(compareVersionNames)
  return { groups, unmatched }
}

function versionFamily(name: string): string {
  const match = name.match(/^(.*)-(?=\d+(?:\.\d+)+(?:[-+.]|$))/)
  return (match?.[1] ?? name).toLocaleLowerCase()
}

function compareVersionNames(left: DevCleanEntry, right: DevCleanEntry): number {
  return right.name.localeCompare(left.name, undefined, { numeric: true, sensitivity: 'base' })
}

function EntryList({
  entries,
  retained = false,
}: {
  entries: Awaited<ReturnType<typeof getDevCleanEntries>>['entries']
  retained?: boolean
}) {
  return (
    <ul className="max-h-64 divide-y overflow-y-auto">
      {entries.map(entry => (
        <li key={entry.path} className="flex items-center gap-2 px-3 py-2 text-xs">
          {entry.directory ? (
            <Folder
              className={`h-3.5 w-3.5 shrink-0 ${
                retained ? 'text-[var(--color-success)]' : 'text-[var(--color-primary)]'
              }`}
            />
          ) : (
            <File className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          )}
          <span className="min-w-0 flex-1 truncate font-mono" title={entry.path}>
            {entry.path}
          </span>
          <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">
            {formatBytes(entry.size)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SelectionSummary({
  active,
  label,
  count,
  bytes,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  bytes: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/8'
          : 'hover:bg-[var(--color-muted)]/30'
      }`}
    >
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{formatNumber(count)} 项</span>
        <span className="text-xs tabular-nums">{formatBytes(bytes)}</span>
      </div>
    </button>
  )
}

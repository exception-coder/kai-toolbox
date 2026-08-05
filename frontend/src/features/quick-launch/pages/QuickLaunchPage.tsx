import { useMemo, useState } from 'react'
import { Plus, Rocket, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { QuickSiteCard } from '../components/QuickSiteCard'
import { QuickSiteEditor } from '../components/QuickSiteEditor'
import {
  useDeleteQuickSite,
  useQuickSites,
  useRecordQuickSiteOpened,
  useSaveQuickSite,
} from '../hooks/useQuickLaunch'
import { openSite } from '../lib/openSite'
import type { QuickSiteUpsert, QuickSiteView } from '../types'

export function QuickLaunchPage() {
  const confirm = useConfirm()
  const sitesQuery = useQuickSites()
  const saveSite = useSaveQuickSite()
  const deleteSite = useDeleteQuickSite()
  const recordOpened = useRecordQuickSiteOpened()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<QuickSiteView | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sites = sitesQuery.data ?? []
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sites
    return sites.filter(site => [site.title, site.siteUrl, site.groupName]
      .some(value => value.toLowerCase().includes(query)))
  }, [search, sites])

  const recent = useMemo(() => sites
    .filter(site => site.enabled && site.lastOpenedAt != null)
    .sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0))
    .slice(0, 8), [sites])

  const groups = useMemo(() => {
    const grouped = new Map<string, QuickSiteView[]>()
    filtered.forEach(site => grouped.set(site.groupName, [...(grouped.get(site.groupName) ?? []), site]))
    return [...grouped.entries()]
  }, [filtered])

  function startCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function startEdit(site: QuickSiteView) {
    setEditing(site)
    setEditorOpen(true)
  }

  function handleOpen(site: QuickSiteView) {
    clearFeedback()
    try {
      if (site.openMode === 'CURRENT') {
        navigator.sendBeacon(`/api/quick-launch/sites/${encodeURIComponent(site.id)}/opened`)
      }
      openSite(site)
      if (site.openMode !== 'CURRENT') recordOpened.mutate(site.id)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function handleCopy(site: QuickSiteView) {
    clearFeedback()
    try {
      await navigator.clipboard.writeText(site.siteUrl)
      setMessage(`已复制「${site.title}」链接`)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  function handleSave(payload: QuickSiteUpsert) {
    clearFeedback()
    saveSite.mutate({ id: editing?.id ?? null, payload }, {
      onSuccess: () => {
        setEditorOpen(false)
        setEditing(null)
        setMessage(editing ? '站点已更新' : '站点已添加')
      },
      onError: caught => setError(errorMessage(caught)),
    })
  }

  function handleTogglePin(site: QuickSiteView) {
    clearFeedback()
    saveSite.mutate({ id: site.id, payload: toPayload(site, { pinned: !site.pinned }) }, {
      onError: caught => setError(errorMessage(caught)),
    })
  }

  async function handleDelete(site: QuickSiteView) {
    const approved = await confirm({
      title: '删除快捷站点',
      description: `确定删除「${site.title}」？`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!approved) return
    clearFeedback()
    deleteSite.mutate(site.id, {
      onSuccess: () => setMessage('站点已删除'),
      onError: caught => setError(errorMessage(caught)),
    })
  }

  function clearFeedback() {
    setMessage(null)
    setError(null)
  }

  const cardProps = {
    onOpen: handleOpen,
    onCopy: handleCopy,
    onEdit: startEdit,
    onTogglePin: handleTogglePin,
    onDelete: handleDelete,
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Rocket className="size-5" />快捷入口</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">打开常用工作站点，用完关闭窗口即可回到 Forge。</p>
        </div>
        <Button size="sm" onClick={startCreate}><Plus />新增站点</Button>
      </header>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索标题、网址或分组" className="pl-9" />
      </div>

      {message && <Feedback>{message}</Feedback>}
      {error && <Feedback error>{error}</Feedback>}

      {sitesQuery.isLoading ? (
        <EmptyState text="正在加载快捷站点…" />
      ) : sitesQuery.isError ? (
        <EmptyState text="站点加载失败，请稍后重试。" error />
      ) : sites.length === 0 ? (
        <EmptyState text="还没有常用站点，点击「新增站点」开始登记。" />
      ) : (
        <>
          {!search.trim() && recent.length > 0 && (
            <SiteSection title="最近使用" sites={recent} cardProps={cardProps} />
          )}
          {groups.map(([groupName, groupSites]) => (
            <SiteSection key={groupName} title={groupName} sites={groupSites} cardProps={cardProps} />
          ))}
          {filtered.length === 0 && <EmptyState text="没有匹配的站点。" />}
        </>
      )}

      <QuickSiteEditor
        open={editorOpen}
        site={editing}
        saving={saveSite.isPending}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}

type CardProps = Omit<React.ComponentProps<typeof QuickSiteCard>, 'site'>

function SiteSection({ title, sites, cardProps }: { title: string; sites: QuickSiteView[]; cardProps: CardProps }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-[var(--color-muted-foreground)]">{sites.length}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {sites.map(site => <QuickSiteCard key={`${title}-${site.id}`} site={site} {...cardProps} />)}
      </div>
    </section>
  )
}

function Feedback({ error = false, children }: { error?: boolean; children: React.ReactNode }) {
  return (
    <div className={error
      ? 'rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]'
      : 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'}>
      {children}
    </div>
  )
}

function EmptyState({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={error ? 'rounded-lg border border-dashed p-10 text-center text-sm text-[var(--color-destructive)]' : 'rounded-lg border border-dashed p-10 text-center text-sm text-[var(--color-muted-foreground)]'}>{text}</div>
}

function toPayload(site: QuickSiteView, change: Partial<QuickSiteUpsert>): QuickSiteUpsert {
  return {
    title: site.title,
    siteUrl: site.siteUrl,
    groupName: site.groupName,
    icon: site.icon,
    openMode: site.openMode,
    windowWidth: site.windowWidth,
    windowHeight: site.windowHeight,
    sortOrder: site.sortOrder,
    pinned: site.pinned,
    enabled: site.enabled,
    ...change,
  }
}

function errorMessage(caught: unknown) {
  return caught instanceof ApiError || caught instanceof Error ? caught.message : String(caught)
}

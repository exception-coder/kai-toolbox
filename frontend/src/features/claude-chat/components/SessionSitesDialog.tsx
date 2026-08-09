import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveSiteIcon } from '@/lib/siteIcons'
import {
  listQuickSiteSummaries,
  recordQuickSiteSummaryOpened,
  type QuickSiteSummary,
} from '@/lib/quickSites'
import { listSessionSiteIds, replaceSessionSiteIds } from '../api'
import { openQuickSite } from '@/lib/openQuickSite'
import { SiteOpenModeMenu, type SiteOpenChoice } from './SiteOpenModeMenu'

interface Props {
  sessionId: string
  onChanged: (sites: QuickSiteSummary[]) => void
  onClose: () => void
}

/** 从快捷入口选择会话测试站点，并按站点配置的窗口方式启动验证。 */
export function SessionSitesDialog({ sessionId, onChanged, onClose }: Props) {
  const [sites, setSites] = useState<QuickSiteSummary[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([listQuickSiteSummaries(), listSessionSiteIds(sessionId)])
      .then(([availableSites, linkedIds]) => {
        if (!active) return
        const enabledSites = availableSites.filter(site => site.enabled)
        const enabledIds = new Set(enabledSites.map(site => site.id))
        setSites(enabledSites)
        setSelectedIds(linkedIds.filter(id => enabledIds.has(id)))
      })
      .catch(caught => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [sessionId])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sites
    return sites.filter(site => [site.title, site.siteUrl, site.groupName]
      .some(value => value.toLowerCase().includes(query)))
  }, [search, sites])

  function toggle(siteId: string) {
    setSelectedIds(current => current.includes(siteId)
      ? current.filter(id => id !== siteId)
      : [...current, siteId])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await replaceSessionSiteIds(sessionId, selectedIds)
      onChanged(selectedIds.flatMap(id => sites.find(site => site.id === id) ?? []))
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  function open(site: QuickSiteSummary, choice?: SiteOpenChoice) {
    try {
      openQuickSite(choice ? { ...site, windowBehavior: choice.windowBehavior } : site, choice?.openMode, !!choice)
      void recordQuickSiteSummaryOpened(site.id)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3" onMouseDown={onClose}>
      <section
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">会话测试站点</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">站点来自快捷入口，点击图标可按配置的窗口方式立即验证。</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}><X className="size-4" /></Button>
        </header>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索快捷站点、分组或地址" className="pl-9" />
          </div>
        </div>

        <div className="min-h-48 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid min-h-40 place-items-center"><Loader2 className="size-5 animate-spin" /></div>
          ) : sites.length === 0 ? (
            <div className="grid min-h-40 place-items-center text-sm text-[var(--color-muted-foreground)]">快捷入口中还没有可用站点</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map(site => {
                const Icon = resolveSiteIcon(site.icon)
                const selected = selectedIds.includes(site.id)
                return (
                  <article key={site.id} className={`flex items-center gap-2 rounded-lg border p-2 ${selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''}`}>
                    <button
                      type="button"
                      className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20"
                      title={`按站点配置打开 ${site.title}`}
                      onClick={() => open(site)}
                    >
                      <Icon className="size-4" />
                    </button>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(site.id)}>
                      <span className="block truncate text-xs font-medium">{site.title}</span>
                      <span className="block truncate text-[10px] text-[var(--color-muted-foreground)]">{site.groupName} · {site.siteUrl}</span>
                    </button>
                    <input type="checkbox" checked={selected} onChange={() => toggle(site.id)} aria-label={`关联 ${site.title}`} />
                    <SiteOpenModeMenu onSelect={choice => open(site, choice)} />
                  </article>
                )
              })}
            </div>
          )}
          {!loading && filtered.length === 0 && sites.length > 0 && (
            <div className="grid min-h-32 place-items-center text-sm text-[var(--color-muted-foreground)]">没有匹配的快捷站点</div>
          )}
          {error && <p className="mt-3 text-xs text-[var(--color-destructive)]">{error}</p>}
        </div>

        <footer className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-[var(--color-muted-foreground)]">已关联 {selectedIds.length} 个站点</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>{saving && <Loader2 className="animate-spin" />}保存关联</Button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught)
}

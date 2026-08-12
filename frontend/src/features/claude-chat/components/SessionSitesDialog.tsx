import { useEffect, useMemo, useState } from 'react'
import { Globe2, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveSiteIcon } from '@/lib/siteIcons'
import {
  listQuickSiteSummaries,
  recordQuickSiteSummaryOpened,
  type QuickSiteSummary,
} from '@/lib/quickSites'
import { getSessionSiteConfiguration, replaceSessionSiteConfiguration } from '../api'
import type { SessionCustomSite } from '../types'
import {
  customSiteToLinkedSite,
  quickSiteToLinkedSite,
  type SessionLinkedSite,
} from '../lib/sessionSites'
import { openQuickSite } from '@/lib/openQuickSite'
import { SiteOpenModeMenu, type SiteOpenChoice } from './SiteOpenModeMenu'

interface Props {
  sessionId: string
  onChanged: (sites: SessionLinkedSite[]) => void
  onClose: () => void
}

const MAX_SESSION_SITE_COUNT = 20

/** 管理会话关联的快捷站点和仅属于当前会话的临时站点。 */
export function SessionSitesDialog({ sessionId, onChanged, onClose }: Props) {
  const [sites, setSites] = useState<QuickSiteSummary[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [customSites, setCustomSites] = useState<SessionCustomSite[]>([])
  const [addingCustom, setAddingCustom] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([listQuickSiteSummaries(), getSessionSiteConfiguration(sessionId)])
      .then(([availableSites, configuration]) => {
        if (!active) return
        const enabledSites = availableSites.filter(site => site.enabled)
        const enabledIds = new Set(enabledSites.map(site => site.id))
        setSites(enabledSites)
        setSelectedIds(configuration.quickSiteIds.filter(id => enabledIds.has(id)))
        setCustomSites(configuration.customSites)
      })
      .catch(caught => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [sessionId])

  const normalizedSearch = search.trim().toLowerCase()
  const filteredSites = useMemo(() => {
    if (!normalizedSearch) return sites
    return sites.filter(site => [site.title, site.siteUrl, site.groupName]
      .some(value => value.toLowerCase().includes(normalizedSearch)))
  }, [normalizedSearch, sites])
  const filteredCustomSites = useMemo(() => {
    if (!normalizedSearch) return customSites
    return customSites.filter(site => [site.title, site.siteUrl]
      .some(value => value.toLowerCase().includes(normalizedSearch)))
  }, [customSites, normalizedSearch])
  const totalCount = selectedIds.length + customSites.length

  function toggle(siteId: string) {
    setError(null)
    setSelectedIds(current => {
      if (current.includes(siteId)) return current.filter(id => id !== siteId)
      if (current.length + customSites.length >= MAX_SESSION_SITE_COUNT) {
        setError(`每个会话最多关联 ${MAX_SESSION_SITE_COUNT} 个测试站点`)
        return current
      }
      return [...current, siteId]
    })
  }

  function addCustomSite() {
    setError(null)
    if (totalCount >= MAX_SESSION_SITE_COUNT) {
      setError(`每个会话最多关联 ${MAX_SESSION_SITE_COUNT} 个测试站点`)
      return
    }
    try {
      const customSite: SessionCustomSite = {
        id: createSiteId(),
        title: requireTitle(draftTitle),
        siteUrl: normalizeHttpUrl(draftUrl),
      }
      setCustomSites(current => [...current, customSite])
      setDraftTitle('')
      setDraftUrl('')
      setAddingCustom(false)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  function updateCustomSite(id: string, patch: Partial<Pick<SessionCustomSite, 'title' | 'siteUrl'>>) {
    setCustomSites(current => current.map(site => site.id === id ? { ...site, ...patch } : site))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const normalizedCustomSites = customSites.map(site => ({
        ...site,
        title: requireTitle(site.title),
        siteUrl: normalizeHttpUrl(site.siteUrl),
      }))
      await replaceSessionSiteConfiguration(sessionId, {
        quickSiteIds: selectedIds,
        customSites: normalizedCustomSites,
      })
      const linkedQuickSites = selectedIds.flatMap(id => {
        const site = sites.find(candidate => candidate.id === id)
        return site ? [quickSiteToLinkedSite(site)] : []
      })
      onChanged([
        ...linkedQuickSites,
        ...normalizedCustomSites.map(customSiteToLinkedSite),
      ])
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  function open(site: SessionLinkedSite, choice?: SiteOpenChoice) {
    try {
      openQuickSite(choice ? { ...site, windowBehavior: choice.windowBehavior } : site, choice?.openMode, !!choice)
      if (site.sourceType === 'QUICK') void recordQuickSiteSummaryOpened(site.id)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  function openCustomSite(site: SessionCustomSite, choice?: SiteOpenChoice) {
    try {
      open(customSiteToLinkedSite({
        ...site,
        title: requireTitle(site.title),
        siteUrl: normalizeHttpUrl(site.siteUrl),
      }), choice)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3" onMouseDown={onClose}>
      <section
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">会话测试站点</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">可关联快捷入口，也可添加只属于当前会话的标题和具体地址。</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}><X className="size-4" /></Button>
        </header>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索快捷站点、临时标题或具体地址" className="pl-9" />
          </div>
        </div>

        <div className="min-h-48 flex-1 space-y-4 overflow-y-auto p-3">
          {loading ? (
            <div className="grid min-h-40 place-items-center"><Loader2 className="size-5 animate-spin" /></div>
          ) : (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold">临时站点</h3>
                    <p className="text-[10px] text-[var(--color-muted-foreground)]">保存当前会话需要验证的具体页面，不会加入全局快捷入口。</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={totalCount >= MAX_SESSION_SITE_COUNT}
                    onClick={() => { setAddingCustom(true); setError(null) }}
                  >
                    <Plus className="size-3.5" />添加临时站点
                  </Button>
                </div>

                {addingCustom && (
                  <div className="mb-2 grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_auto]">
                    <Input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} placeholder="标题，如 ERP 入仓取消页" className="h-8 text-xs" autoFocus />
                    <Input value={draftUrl} onChange={event => setDraftUrl(event.target.value)} placeholder="地址，可直接填写 localhost:8080/具体路径" className="h-8 text-xs" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-8" onClick={addCustomSite}>添加</Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setAddingCustom(false)}>取消</Button>
                    </div>
                  </div>
                )}

                {filteredCustomSites.length > 0 ? (
                  <div className="space-y-2">
                    {filteredCustomSites.map(site => {
                      return (
                        <article key={site.id} className="grid items-center gap-2 rounded-lg border p-2 sm:grid-cols-[auto_minmax(0,0.8fr)_minmax(0,1.5fr)_auto_auto]">
                          <button
                            type="button"
                            className="grid size-9 shrink-0 place-items-center rounded-md bg-sky-500/10 text-sky-600 hover:bg-sky-500/20"
                            title={`打开 ${site.title || '临时站点'}`}
                            onClick={() => openCustomSite(site)}
                          >
                            <Globe2 className="size-4" />
                          </button>
                          <Input value={site.title} onChange={event => updateCustomSite(site.id, { title: event.target.value })} aria-label="临时站点标题" className="h-8 text-xs" />
                          <Input value={site.siteUrl} onChange={event => updateCustomSite(site.id, { siteUrl: event.target.value })} aria-label="临时站点地址" className="h-8 text-xs" />
                          <SiteOpenModeMenu allowControlled={false} onSelect={choice => openCustomSite(site, choice)} />
                          <Button variant="ghost" size="icon" className="size-8 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]" onClick={() => setCustomSites(current => current.filter(candidate => candidate.id !== site.id))} title="删除临时站点">
                            <Trash2 className="size-4" />
                          </Button>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-20 place-items-center rounded-lg border border-dashed text-xs text-[var(--color-muted-foreground)]">
                    {customSites.length > 0 ? '没有匹配的临时站点' : '还没有临时站点，可添加具体业务页面地址'}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2">
                  <h3 className="text-xs font-semibold">快捷入口站点</h3>
                  <p className="text-[10px] text-[var(--color-muted-foreground)]">复用系统快捷入口配置、图标和默认打开方式。</p>
                </div>
                {filteredSites.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredSites.map(site => {
                      const Icon = resolveSiteIcon(site.icon)
                      const selected = selectedIds.includes(site.id)
                      const linkedSite = quickSiteToLinkedSite(site)
                      return (
                        <article key={site.id} className={`flex items-center gap-2 rounded-lg border p-2 ${selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''}`}>
                          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20" title={`按站点配置打开 ${site.title}`} onClick={() => open(linkedSite)}>
                            <Icon className="size-4" />
                          </button>
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(site.id)}>
                            <span className="block truncate text-xs font-medium">{site.title}</span>
                            <span className="block truncate text-[10px] text-[var(--color-muted-foreground)]">{site.groupName} · {site.siteUrl}</span>
                          </button>
                          <input type="checkbox" checked={selected} onChange={() => toggle(site.id)} aria-label={`关联 ${site.title}`} />
                          <SiteOpenModeMenu onSelect={choice => open(linkedSite, choice)} />
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-20 place-items-center rounded-lg border border-dashed text-xs text-[var(--color-muted-foreground)]">
                    {sites.length > 0 ? '没有匹配的快捷站点' : '快捷入口中还没有可用站点'}
                  </div>
                )}
              </section>
            </>
          )}
          {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
        </div>

        <footer className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-[var(--color-muted-foreground)]">已关联 {totalCount} / {MAX_SESSION_SITE_COUNT} 个站点</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" disabled={saving || loading} onClick={() => void save()}>{saving && <Loader2 className="animate-spin" />}保存关联</Button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function requireTitle(value: string) {
  const title = value.trim()
  if (!title) throw new Error('请填写临时站点标题')
  if (title.length > 100) throw new Error('临时站点标题不能超过 100 个字符')
  return title
}

function normalizeHttpUrl(value: string) {
  const raw = value.trim()
  if (!raw) throw new Error('请填写临时站点地址')
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error('临时站点地址格式不正确')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('临时站点地址仅支持 HTTP/HTTPS')
  if (parsed.username || parsed.password) throw new Error('临时站点地址不能包含用户名或密码')
  if (parsed.href.length > 2000) throw new Error('临时站点地址不能超过 2000 个字符')
  return parsed.href
}

function createSiteId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught)
}

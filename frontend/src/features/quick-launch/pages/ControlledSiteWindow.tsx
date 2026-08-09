import { useEffect, useMemo, useState } from 'react'
import { Loader2, LogIn, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listQuickSiteSummaries, type QuickSiteSummary } from '@/lib/quickSites'
import { resolveSiteIcon } from '@/lib/siteIcons'

/** 在独立 Forge 容器中加载站点，并通过 iframe sandbox 阻止派生窗口。 */
export function ControlledSiteWindow() {
  const siteId = useMemo(() => new URLSearchParams(window.location.search).get('siteId') ?? '', [])
  const [site, setSite] = useState<QuickSiteSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    listQuickSiteSummaries()
      .then(sites => {
        const matched = sites.find(item => item.id === siteId && item.enabled)
        if (!matched) throw new Error('快捷站点不存在或已停用')
        setSite(matched)
        document.title = `${matched.title} · 受控测试`
      })
      .catch(caught => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false))
  }, [siteId])

  if (loading) {
    return <div className="fixed inset-0 z-[200] grid place-items-center bg-[var(--color-background)]"><Loader2 className="size-6 animate-spin" /></div>
  }
  if (!site || error) {
    return (
      <div className="fixed inset-0 z-[200] grid place-items-center bg-[var(--color-background)] p-6 text-center">
        <div><p className="text-sm text-[var(--color-destructive)]">{error ?? '无法加载站点'}</p><Button className="mt-3" variant="outline" onClick={() => window.close()}>关闭窗口</Button></div>
      </div>
    )
  }

  const Icon = resolveSiteIcon(site.icon)
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--color-background)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-[var(--color-card)] px-2 shadow-sm">
        <span className="grid size-7 place-items-center rounded-md bg-sky-500/10 text-sky-600"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold"><span className="truncate">{site.title}</span><ShieldCheck className="size-3.5 shrink-0 text-emerald-600" /></div>
          <p className="truncate text-[10px] text-[var(--color-muted-foreground)]">受控模式 · 已阻止站点派生新窗口</p>
        </div>
        <Button size="sm" variant="outline" title="退出受控容器并在当前测试窗口登录或标准打开" onClick={() => window.location.assign(site.siteUrl)}><LogIn className="size-3.5" /><span className="hidden sm:inline">登录 / 标准模式</span></Button>
        <Button size="sm" variant="ghost" title="刷新站点" onClick={() => setFrameKey(value => value + 1)}><RefreshCw className="size-3.5" /><span className="hidden sm:inline">刷新</span></Button>
        <Button size="icon" variant="ghost" className="size-8" title="关闭测试窗口" onClick={() => window.close()}><X className="size-4" /></Button>
      </header>
      {site.windowBehavior === 'AUTO' && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-center text-[10px] text-amber-800 dark:text-amber-300">
          页面空白或登录、下载、打印不可用时，请点击右上角“标准打开”。
        </div>
      )}
      <iframe
        key={frameKey}
        src={site.siteUrl}
        title={site.title}
        className="min-h-0 flex-1 border-0 bg-white"
        sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-same-origin allow-scripts"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

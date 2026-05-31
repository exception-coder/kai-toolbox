import { useQuery } from '@tanstack/react-query'
import { Globe, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { downloaderApi } from '../services/downloaderApi'

export function ProxyStatusBadge() {
  // 进入页面时手动探测一次；切换 VPN 后用户可点击「重新探测」刷新
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['downloader', 'proxy'],
    queryFn: () => downloaderApi.detectProxy(),
    staleTime: 30_000,
  })

  if (isLoading) {
    return <Badge variant="outline">代理探测中…</Badge>
  }

  const effective = data?.effective ?? null
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-[var(--color-accent)]"
      onClick={() => refetch()}
      title="点击重新探测系统代理"
    >
      {effective ? (
        <>
          <ShieldCheck className="size-3.5 text-emerald-500" />
          <span>系统代理：</span>
          <code className="font-mono text-[11px]">{effective.originUrl}</code>
          <span className="text-[var(--color-muted-foreground)]">({effective.source})</span>
        </>
      ) : (
        <>
          <Globe className="size-3.5" />
          <span className="text-[var(--color-muted-foreground)]">未检测到代理 · 全走直连</span>
        </>
      )}
    </button>
  )
}

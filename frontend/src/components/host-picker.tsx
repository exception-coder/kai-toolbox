import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, RefreshCcw, Settings, Wifi, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import { useState } from 'react'
import { listHosts, testSavedHost } from '@/features/hosts/api'
import type { HostView } from '@/features/hosts/types'

interface Props {
  /** 当前选中的 hostId；空字符串表示未选 */
  value: string
  onChange: (id: string) => void
  /** 是否允许「-- 不选 --」选项（默认 false：必须选一台） */
  allowEmpty?: boolean
  /** 是否在主机为空时自动选第一台（默认 true） */
  autoSelectFirst?: boolean
  /** 标签筛选：只展示打了此 tag 的主机；空 = 不筛选 */
  filterTag?: string
  /** 额外 CSS 类 */
  className?: string
  /** 标题（默认「选择主机」） */
  label?: string
}

/**
 * 通用主机下拉框：从 /api/hosts 拉列表，附加「测试 / 刷新 / 去管理」按钮。
 * 被磁盘扫描、frp 等需要选主机的工具复用。
 */
export function HostPicker({
  value,
  onChange,
  allowEmpty = false,
  autoSelectFirst = true,
  filterTag,
  className,
  label = '选择主机',
}: Props) {
  const qc = useQueryClient()
  const hostsQuery = useQuery({ queryKey: ['hosts'], queryFn: listHosts })
  const hosts = (hostsQuery.data ?? []).filter(h => !filterTag || h.tag === filterTag)
  const selected: HostView | null = hosts.find(h => h.id === value) ?? null

  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const testMutation = useMutation({
    mutationFn: (id: string) => testSavedHost(id),
    onMutate: () => setTestMsg(null),
    onSuccess: r => setTestMsg({ ok: r.ok, text: r.message }),
    onError: e => setTestMsg({ ok: false, text: e instanceof ApiError ? e.message : String(e) }),
  })

  // 自动选第一台
  useEffect(() => {
    if (!autoSelectFirst) return
    if (!value && hosts.length > 0) {
      onChange(hosts[0].id)
    }
  }, [hosts, value, autoSelectFirst, onChange])

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</span>
        <Link
          to="/tools/hosts"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
        >
          <Settings className="size-3" />
          管理主机
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={e => {
            onChange(e.target.value)
            setTestMsg(null)
          }}
          disabled={hostsQuery.isLoading}
          className="h-9 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-3 text-sm"
        >
          {allowEmpty && <option value="">-- 不选 --</option>}
          {hosts.length === 0 ? (
            <option value="">{hostsQuery.isLoading ? '加载中…' : '暂无主机，请先去「主机管理」登记'}</option>
          ) : (
            hosts.map(h => (
              <option key={h.id} value={h.id}>
                {h.name} · {h.label}
                {h.tag ? ` [${h.tag}]` : ''}
              </option>
            ))
          )}
        </select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['hosts'] })}
          title="刷新主机列表"
        >
          <RefreshCcw />
        </Button>

        {selected && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => testMutation.mutate(selected.id)}
            disabled={testMutation.isPending}
          >
            <Wifi />
            {testMutation.isPending ? '测试中…' : '测连接'}
          </Button>
        )}
      </div>

      {selected && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <Badge variant={selected.authType === 'KEY' ? 'secondary' : 'outline'}>
            {selected.authType === 'KEY' ? '密钥' : '密码'}
          </Badge>
          {selected.tag && <Badge variant="outline">{selected.tag}</Badge>}
          {selected.note && <span className="truncate">{selected.note}</span>}
        </div>
      )}

      {testMsg && (
        <div
          className={
            'mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ' +
            (testMsg.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]')
          }
        >
          {testMsg.ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
          {testMsg.text}
        </div>
      )}
    </div>
  )
}

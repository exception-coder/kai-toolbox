import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import type { DependencyState, ForgeDependencyGroup } from '../types'

const STATE_LABEL: Record<DependencyState, string> = {
  READY: '已就绪',
  MISSING: '未安装',
  INCOMPATIBLE: '版本不兼容',
  ATTENTION: '需关注',
  CHECKING: '检测中',
}

const STATE_TONE: Record<DependencyState, StatusTone> = {
  READY: 'success',
  MISSING: 'danger',
  INCOMPATIBLE: 'danger',
  ATTENTION: 'warning',
  CHECKING: 'info',
}

export function DependencySection({ group }: { group: ForgeDependencyGroup }) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyCommand = async (id: string, command: string) => {
    await navigator.clipboard.writeText(command)
    setCopied(id)
    window.setTimeout(() => setCopied((current) => current === id ? null : current), 1_500)
  }

  return (
    <section className="border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-0" aria-labelledby={`group-${group.id}`}>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id={`group-${group.id}`} className="text-base font-semibold">{group.name}</h2>
        <p className="text-xs text-[var(--color-muted-foreground)]">{group.description}</p>
      </div>

      <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {group.items.map((item) => (
          <div key={item.id} className="grid gap-3 py-4 md:grid-cols-[minmax(140px,0.8fr)_minmax(220px,1.5fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.name}</span>
                <StatusBadge tone={STATE_TONE[item.state]} pulse={item.state === 'CHECKING'}>
                  {STATE_LABEL[item.state]}
                </StatusBadge>
              </div>
              {item.version && <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted-foreground)]" title={item.version}>{item.version}</p>}
            </div>

            <div className="min-w-0">
              <p className="text-sm">{item.summary}</p>
              {item.detail && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-muted-foreground)]" title={item.detail}>{item.detail}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-1 md:justify-end">
              {item.installCommand && item.state !== 'READY' && (
                <Button variant="ghost" size="sm" onClick={() => void copyCommand(item.id, item.installCommand!)}>
                  {copied === item.id ? <Check /> : <Copy />}
                  {copied === item.id ? '已复制' : '复制命令'}
                </Button>
              )}
              {item.officialUrl && (
                <Button asChild variant="ghost" size="sm">
                  <a href={item.officialUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> 官方说明
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

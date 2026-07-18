import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import type { DomainKnowledgeStatus, ModuleGap } from '../types'

export const REGISTRATION_TONE: Record<string, StatusTone> = {
  NOT_REGISTERED: 'neutral',
  PARTIAL: 'warning',
  REGISTERED: 'success',
}
export const REGISTRATION_LABEL: Record<string, string> = {
  NOT_REGISTERED: '未登记',
  PARTIAL: '部分登记',
  REGISTERED: '已登记',
}
export const GRAPHIFY_TONE: Record<string, StatusTone> = {
  NOT_GENERATED: 'neutral',
  STALE: 'warning',
  UP_TO_DATE: 'success',
}
export const GRAPHIFY_LABEL: Record<string, string> = {
  NOT_GENERATED: '未生成',
  STALE: '已过时',
  UP_TO_DATE: '已是最新',
}

/** domain-knowledge / cross-topology 共用的状态卡片：登记态徽标 + 覆盖度 + 缺口清单 + 初始化/更新按钮。 */
export function DomainKnowledgeCard({
  title, description, query, selected, onToggle, onLaunch,
}: {
  title: string
  description: string
  repoKey: string
  query: { data?: DomainKnowledgeStatus; isLoading: boolean; isError: boolean; error: unknown }
  selected: Set<string>
  onToggle: (moduleKey: string) => void
  onLaunch: (scope: 'full' | string[]) => void
}) {
  const data = query.data
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {data && <StatusBadge tone={REGISTRATION_TONE[data.state]}>{REGISTRATION_LABEL[data.state]}</StatusBadge>}
      </CardHeader>
      <CardContent className="text-sm">
        {query.isLoading && <span className="text-[var(--color-muted-foreground)]">检测中…</span>}
        {query.isError && <span className="text-[var(--color-destructive)]">{(query.error as Error).message}</span>}
        {data && (
          <div className="flex flex-col gap-3">
            <p className="text-[var(--color-muted-foreground)]">
              覆盖 {data.coveredModules}/{data.totalModules} 个模块
            </p>
            {data.state === 'NOT_REGISTERED' && (
              <Button onClick={() => onLaunch('full')}>一键初始化</Button>
            )}
            {data.state !== 'NOT_REGISTERED' && (
              <>
                {data.gaps.length > 0 && (
                  <GapList gaps={data.gaps} selected={selected} onToggle={onToggle} />
                )}
                <Button
                  variant="outline"
                  onClick={() => onLaunch(selected.size > 0 ? Array.from(selected) : 'full')}
                >
                  <RefreshCw className="size-4" />
                  更新{selected.size > 0 ? `（勾选的 ${selected.size} 个模块）` : '（全部缺口模块）'}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GapList({ gaps, selected, onToggle }: { gaps: ModuleGap[]; selected: Set<string>; onToggle: (k: string) => void }) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border p-2">
      {gaps.map((g) => (
        <label key={g.moduleKey} className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={selected.has(g.moduleKey)}
            onChange={() => onToggle(g.moduleKey)}
          />
          <span className="flex-1">{g.moduleName}（{g.moduleKey}）</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">{g.existingCount} 条</span>
        </label>
      ))}
    </div>
  )
}

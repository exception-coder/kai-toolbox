import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { HistoryPanel } from '@/features/ops/components/HistoryPanel'
import { SqlConsole } from '@/features/ops/components/SqlConsole'
import { useDbConsole } from '../hooks/useDbConsole'

export function DbConsolePage() {
  const { datasourcesQuery, datasources, selected, selectDatasource } = useDbConsole()
  const [panel, setPanel] = useState<'query' | 'history'>('query')

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5" />
            DB Console
          </CardTitle>
          <CardDescription>
            面向开发排查的轻量 SQL 工作台。第一期复用已登记的数据源，并强制只读查询。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="db-console-datasource">数据库</label>
          <select
            id="db-console-datasource"
            value={selected?.id ?? ''}
            onChange={event => selectDatasource(event.target.value)}
            disabled={datasources.length === 0}
            className="h-9 min-w-72 rounded-md border bg-[var(--color-background)] px-3 text-sm"
          >
            {datasources.length === 0 && <option value="">暂无 SQL 数据源</option>}
            {datasources.map(datasource => (
              <option key={datasource.id} value={datasource.id}>
                {datasource.name} · {datasource.env} · {datasource.type} · {datasource.endpoint}
              </option>
            ))}
          </select>
          <Button asChild size="sm" variant="outline">
            <Link to="/tools/ops">
              <Settings2 />
              管理数据源
            </Link>
          </Button>
          {selected && (
            <Segmented
              className="ml-auto"
              value={panel}
              onChange={setPanel}
              options={[{ value: 'query', label: 'SQL 查询' }, { value: 'history', label: '执行历史' }]}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-h-[560px]">
        <CardContent className="h-full p-4">
          {datasourcesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">加载数据源中…</div>
          ) : datasourcesQuery.isError ? (
            <div className="p-8 text-center text-sm text-[var(--color-destructive)]">数据源加载失败，请稍后重试。</div>
          ) : !selected ? (
            <div className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              尚未登记 MySQL / Oracle 数据源，请先进入「系统与中间件」添加连接。
            </div>
          ) : panel === 'history' ? (
            <HistoryPanel datasource={selected} />
          ) : (
            <SqlConsole datasource={selected} readOnly />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

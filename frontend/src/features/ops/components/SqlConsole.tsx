import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { sqlQuery } from '../api'
import type { DatasourceView, SqlQueryResult } from '../types'
import { ResultTable } from './ResultViews'

interface Props {
  datasource: DatasourceView
}

/** MySQL / Oracle 查询控制台。 */
export function SqlConsole({ datasource }: Props) {
  const qc = useQueryClient()
  const [sql, setSql] = useState('')
  const [maxRows, setMaxRows] = useState(1000)
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidateHistory = () =>
    qc.invalidateQueries({ queryKey: ['ops', 'history', datasource.id] })

  const run = useMutation({
    mutationFn: () => sqlQuery(datasource.id, sql, maxRows),
    onMutate: () => setError(null),
    onSuccess: r => { setResult(r); invalidateHistory() },
    onError: e => {
      setResult(null)
      setError(e instanceof ApiError ? e.message : String(e))
      invalidateHistory()
    },
  })

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && sql.trim()) {
      e.preventDefault()
      run.mutate()
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <textarea
        value={sql}
        onChange={e => setSql(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`-- 输入 SQL，Ctrl/Cmd + Enter 执行\nSELECT * FROM ...`}
        spellCheck={false}
        className="h-36 w-full resize-y rounded-md border bg-[var(--color-background)] p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || !sql.trim()}>
          <Play />
          {run.isPending ? '执行中…' : '执行'}
        </Button>
        <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
          最多返回
          <Input
            value={String(maxRows)}
            onChange={e => setMaxRows(Number(e.target.value) || 1000)}
            inputMode="numeric"
            className="h-7 w-20"
          />
          行
        </span>
        {result && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {result.updateCount >= 0
              ? `影响 ${result.updateCount} 行`
              : `${result.rowCount} 行${result.truncated ? '（已截断）' : ''}`}
            {' · '}{result.elapsedMs}ms
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)] whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && result.updateCount < 0 && (
        <ResultTable columns={result.columns} rows={result.rows} />
      )}
    </div>
  )
}

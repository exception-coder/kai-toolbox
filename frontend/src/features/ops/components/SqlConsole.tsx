import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleX, Play, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { sqlCheck, sqlQuery, sqlReadOnlyQuery } from '../api'
import type { DatasourceView, SqlCheckResult, SqlQueryResult } from '../types'
import { ResultTable } from './ResultViews'

interface Props {
  datasource: DatasourceView
  readOnly?: boolean
}

/** MySQL / Oracle 查询控制台。 */
export function SqlConsole({ datasource, readOnly = false }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [sql, setSql] = useState('')
  const [maxRows, setMaxRows] = useState(1000)
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<SqlCheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const invalidateHistory = () =>
    qc.invalidateQueries({ queryKey: ['ops', 'history', datasource.id] })

  const run = useMutation({
    mutationFn: async (): Promise<SqlQueryResult | null> => {
      if (readOnly) return sqlReadOnlyQuery(datasource.id, sql, maxRows)
      try {
        return await sqlQuery(datasource.id, sql, maxRows)
      } catch (e) {
        if (!isWriteConfirmationRequired(e)) throw e
        const ok = await confirm({
          variant: 'destructive',
          title: '确认执行写 SQL',
          description: (
            <span className="block space-y-2">
              <span className="block">
                目标：[{datasource.env}] {datasource.name}（{datasource.endpoint}）
              </span>
              <span className="block">该语句可能修改数据或数据库结构，执行后不保证可以回滚。</span>
              <code className="block max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-muted)]/50 p-2 text-xs">
                {sql.length > 1200 ? `${sql.slice(0, 1200)}\n…` : sql}
              </code>
            </span>
          ),
          confirmText: '确认执行',
        })
        return ok ? sqlQuery(datasource.id, sql, maxRows, true) : null
      }
    },
    onMutate: () => setError(null),
    onSuccess: r => {
      if (r == null) return
      setResult(r)
      invalidateHistory()
    },
    onError: e => {
      setResult(null)
      setError(e instanceof ApiError ? e.message : String(e))
      invalidateHistory()
    },
  })

  const check = useMutation({
    mutationFn: () => sqlCheck(datasource.id, sql),
    onMutate: () => {
      setCheckError(null)
      setCheckResult(null)
    },
    onSuccess: setCheckResult,
    onError: e => setCheckError(e instanceof ApiError ? e.message : String(e)),
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
        onChange={e => {
          setSql(e.target.value)
          setCheckResult(null)
          setCheckError(null)
        }}
        onKeyDown={onKeyDown}
        placeholder={readOnly
          ? `-- 只读模式，仅支持单条 SELECT / WITH\nSELECT * FROM ...`
          : `-- 支持单条查询、DML 与 DDL；Ctrl/Cmd + Enter 执行\nUPDATE ...`}
        spellCheck={false}
        className="h-36 w-full resize-y rounded-md border bg-[var(--color-background)] p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => run.mutate()}
          disabled={run.isPending || check.isPending || !sql.trim()}
        >
          <Play />
          {run.isPending ? '执行中…' : '执行'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => check.mutate()}
          disabled={check.isPending || run.isPending || !sql.trim()}
        >
          <ScanSearch />
          {check.isPending ? '检查中…' : '检查 SQL'}
        </Button>
        {readOnly && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            只读保护
          </span>
        )}
        {!readOnly && (
          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
            写入已开启 · 写 SQL 需确认
          </span>
        )}
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

      {checkResult && <SqlCheckNotice result={checkResult} datasource={datasource} />}
      {checkError && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)] whitespace-pre-wrap">
          SQL 检查请求失败：{checkError}
        </div>
      )}

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

function SqlCheckNotice({ result, datasource }: { result: SqlCheckResult; datasource: DatasourceView }) {
  const valid = result.status === 'VALID'
  const warning = result.status === 'UNSUPPORTED'
  const Icon = valid ? CheckCircle2 : warning ? AlertTriangle : CircleX
  const typeLabel = {
    READ: '查询',
    DML: '数据写入',
    DDL: '结构变更',
    OTHER: '其他语句',
    UNKNOWN: '未知语句',
  }[result.statementType]

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
      valid && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
      warning && 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
      !valid && !warning && 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
    )}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="font-medium">
          {valid ? '目标环境检查通过' : warning ? '无法安全检查该语句' : result.status === 'ERROR' ? '检查服务异常' : '目标环境检查未通过'}
          {' · '}{typeLabel} · {result.elapsedMs}ms
        </div>
        <div className="mt-0.5 break-words opacity-90">
          [{datasource.env}] {datasource.name}：{result.message}
        </div>
        {valid && (
          <div className="mt-1 opacity-75">检查只代表当前时刻可解析，不会锁定对象状态，也不会执行待检查 SQL。</div>
        )}
      </div>
    </div>
  )
}

function isWriteConfirmationRequired(error: unknown) {
  return error instanceof ApiError
    && error.message.startsWith('WRITE_CONFIRMATION_REQUIRED:')
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { redisExec } from '../api'
import type { DatasourceView, RedisExecResult } from '../types'
import { RedisValue } from './ResultViews'

interface Props {
  datasource: DatasourceView
}

const DANGER = /^\s*(FLUSHALL|FLUSHDB|KEYS|SHUTDOWN|CONFIG\s+SET)\b/i

/** Redis 命令控制台。 */
export function RedisConsole({ datasource }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [command, setCommand] = useState('')
  const [result, setResult] = useState<RedisExecResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidateHistory = () =>
    qc.invalidateQueries({ queryKey: ['ops', 'history', datasource.id] })

  const run = useMutation({
    mutationFn: () => redisExec(datasource.id, command),
    onMutate: () => setError(null),
    onSuccess: r => { setResult(r); invalidateHistory() },
    onError: e => {
      setResult(null)
      setError(e instanceof ApiError ? e.message : String(e))
      invalidateHistory()
    },
  })

  async function submit() {
    if (!command.trim()) return
    if (DANGER.test(command)) {
      const ok = await confirm({
        variant: 'destructive',
        title: '高风险命令',
        description: `即将在 [${datasource.env}] ${datasource.name} 上执行：\n${command}\n\n这类命令可能清空数据或阻塞实例，确认执行？`,
        confirmText: '仍然执行',
      })
      if (!ok) return
    }
    run.mutate()
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="输入 Redis 命令，例如 GET user:1 / HGETALL cfg / TTL key / SCAN 0 MATCH * COUNT 100"
          spellCheck={false}
          className="h-10 flex-1 rounded-md border bg-[var(--color-background)] px-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
        <Button onClick={submit} disabled={run.isPending || !command.trim()}>
          <Play />
          {run.isPending ? '执行中…' : '执行'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)] whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-[var(--color-muted)]/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span className="font-mono">{result.command}</span>
            <span>· {result.elapsedMs}ms</span>
          </div>
          <RedisValue value={result.result} />
        </div>
      )}
    </div>
  )
}

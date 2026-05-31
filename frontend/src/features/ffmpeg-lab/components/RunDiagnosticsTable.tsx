import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { recentRuns } from '../api'
import type { RunItem } from '../types'

const MODE_LABEL: Record<string, string> = {
  REMUX_COPY: 'Remux 直封装',
  PROGRESSIVE_MP4: 'Progressive MP4',
  HLS_TS: 'HLS (TS)',
  HLS_FMP4: 'HLS (fMP4)',
  MJPEG: 'MJPEG 帧流',
}

/** 诊断表：轮询 /runs/recent，展示每次运行的成功/退出码/耗时/产物大小/stderr 尾部。 */
export function RunDiagnosticsTable() {
  const { data } = useQuery({
    queryKey: ['ffmpeg-lab', 'recent-runs'],
    queryFn: recentRuns,
    refetchInterval: 2000,
  })

  const runs = data?.runs ?? []

  return (
    <div className="rounded-lg border bg-[var(--color-card)]">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="text-sm font-medium">运行诊断</div>
        <div className="text-xs text-[var(--color-muted-foreground)]">
          活跃 ffmpeg 进程：<span className="tabular-nums">{data?.activeFfmpegCount ?? 0}</span>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
          还没有运行记录，选一个模式跑跑看
        </div>
      ) : (
        <ul className="divide-y">
          {runs.map(run => (
            <DiagnosticRow key={run.runId + run.timestamp} run={run} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DiagnosticRow({ run }: { run: RunItem }) {
  const elapsed = run.firstByteMs != null
    ? `首帧 ${run.firstByteMs}ms`
    : run.totalMs != null
      ? `${run.totalMs}ms`
      : '—'
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        {run.success
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          : <XCircle className="h-4 w-4 shrink-0 text-[var(--color-destructive)]" />}
        <span className="text-sm font-medium">{MODE_LABEL[run.mode] ?? run.mode}</span>
        <span className={cn(
          'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
          run.success ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]',
        )}>
          exit {run.exitCode}
        </span>
        <span className="ml-auto text-xs tabular-nums text-[var(--color-muted-foreground)]">
          {elapsed} · {formatBytes(run.outputBytes)}
        </span>
      </div>
      {!run.success && run.stderrTail.length > 0 && (
        <pre className="mt-1.5 max-h-28 overflow-auto rounded-md bg-[var(--color-muted)] p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {run.stderrTail.join('\n')}
        </pre>
      )}
    </li>
  )
}

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { http } from '@/lib/api'

interface Project { id: string; label: string; path: string }
interface Result { status: string; message: string; branch: string | null; headAtCheck: string | null; checkedAt: number }
type Row = Project & { result?: Result; pending?: boolean; unknown?: boolean }
const labels: Record<string, string> = {
  UPDATED: '已更新', UP_TO_DATE: '检查时已是最新', LOCAL_CHANGES: '保留本地改动',
  LOCAL_ONLY: '仅本地目录', BLOCKED: '无法安全快进', UNVERIFIED: '未确认最新', SYNCING: '其他操作进行中',
}

/** 管理配置中的批量入口；逐项请求可呈现局部失败与已完成结果。 */
export function ConsultSourceSync({ onBusyChange, disabled = false }: { onBusyChange: (busy: boolean) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const run = async () => {
    if (busy || disabled) return
    setBusy(true); onBusyChange(true); setError(''); setRows([])
    try {
      const projects = await http<Project[]>('/fore-consult/source-sync')
      setRows(projects)
      if (!projects.length) setError('没有可同步的已保存候选，请先保存系统显示并确认源码目录可用。')
      for (const project of projects) {
        setRows(current => current.map(row => row.id === project.id ? { ...row, pending: true } : row))
        try {
          const result = await http<Result>(`/fore-consult/source-sync/${encodeURIComponent(project.id)}`, { method: 'POST' })
          setRows(current => current.map(row => row.id === project.id ? { ...row, pending: false, result } : row))
        } catch {
          // 断连并不能证明Git未执行；保留局部结果，继续其余项目。
          setRows(current => current.map(row => row.id === project.id ? { ...row, pending: false, unknown: true } : row))
        }
      }
    } catch {
      setError('无法读取同步范围，请稍后重试。')
    } finally { setBusy(false); onBusyChange(false) }
  }
  return <section aria-label="项目源码同步" className="my-4 border-y border-border py-4 text-foreground">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-medium">项目源码</h4>
      <button type="button" disabled={busy || disabled} onClick={() => void run()}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {busy ? '正在逐项检查…' : '一键 Pull 相关项目'}
      </button>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">按已保存的前8个可用候选逐项重新检查当前分支上游，仅安全快进；保留本地改动，不切换分支、不重建源码索引。</p>
    {busy && <p role="status" className="mt-2 text-xs text-muted-foreground">正在同步，请等待结果后关闭配置。</p>}
    {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    <ul aria-live="polite" className="mt-3 divide-y divide-border">
      {rows.map(row => <li key={row.id} className="py-3 text-xs">
        <div className="flex flex-wrap justify-between gap-2 font-medium"><span>{row.label}</span>
          <span>{row.pending ? '正在检查…' : row.unknown ? '结果未知' : row.result ? labels[row.result.status] ?? '未确认最新' : '等待检查'}</span></div>
        <p className="mt-1 break-all text-muted-foreground">{row.path}</p>
        {row.unknown && <p className="mt-1 text-destructive">请求未完成，不能确认是否已更新；请重新检查实际结果。</p>}
        {row.result && <>
          <p className="mt-1 leading-relaxed text-muted-foreground">{row.result.message}</p>
          <p className="mt-1 break-all text-muted-foreground">{new Date(row.result.checkedAt).toLocaleString()}
            {row.result.branch && ` · ${row.result.branch}`}{row.result.headAtCheck && ` · ${row.result.headAtCheck.slice(0, 12)}`}</p>
        </>}
      </li>)}
    </ul>
  </section>
}

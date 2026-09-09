import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, http } from '@/lib/api'
import { StartupStages } from '../components/StartupStages'
import { StartupSteps } from '../components/StartupSteps'
import {
  exportReport, MAX_REPORT_BYTES, parseReport, snapshotSchema, statusLabels, type MeasurementReport,
} from '../model'

export default function StartupPerformancePage() {
  const [imported, setImported] = useState<MeasurementReport | null>(null)
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const query = useQuery({
    queryKey: ['startup-performance'],
    queryFn: async () => snapshotSchema.parse(await http<unknown>('/performance/startup')),
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !imported,
  })
  const snapshot = imported ? imported.runtime : query.data ?? null
  const downloadable = imported ?? snapshot

  async function importFile(file?: File) {
    if (!file) return
    try {
      if (file.size > MAX_REPORT_BYTES) throw new Error('报告超过 2 MB，请选择测量命令生成的 report.json。')
      const value: unknown = JSON.parse(await file.text())
      setImported(parseReport(value))
      setImportError('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '无法读取报告，请重新选择 JSON 文件。')
    }
  }

  return <main className="mx-auto w-full max-w-6xl space-y-8 p-6 text-foreground md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs text-muted-foreground">运维 / 性能观测</p>
        <h1 className="text-2xl font-semibold tracking-tight">启动性能治理</h1>
        <p className="mt-2 text-sm text-muted-foreground">把等待拆开，找到值得优化的启动环节。</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Upload />导入报告</Button>
        <Button variant="outline" size="sm" disabled={!downloadable} onClick={() => downloadable && exportReport(downloadable)}><Download />导出 JSON</Button>
        <Button variant="outline" size="sm" disabled={query.isFetching && !imported}
          onClick={() => { if (imported) setImported(null); else void query.refetch() }}>
          <RefreshCw />{imported ? '返回当前进程' : '刷新'}</Button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="选择启动测量报告"
        onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} />
    </header>
    {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
    {!imported && query.isError && <section role="alert" className="border-y border-border py-5">
      <h2 className="font-medium">暂时无法读取当前启动记录</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {query.error instanceof ApiError && [401, 403].includes(query.error.status)
          ? '请使用右上角账号入口登录管理员账号，然后刷新。也可以导入本地测量报告。'
          : '请确认后端已启动且包含性能治理模块，然后重试。已有本地报告也可以直接导入。'}
      </p><Button className="mt-3" variant="outline" size="sm" onClick={() => void query.refetch()}>重新读取</Button>
    </section>}
    {!imported && query.isPending && <p role="status" className="border-y border-border py-6 text-sm text-muted-foreground">正在读取当前进程的启动观测…</p>}
    {(snapshot || imported) && <>
      <div className="flex flex-wrap justify-between gap-3 border-y border-border py-3 text-xs text-muted-foreground">
        <span>{imported ? '已导入测量报告' : '当前进程'} · {snapshot ? `PID ${snapshot.processId}` : '运行阶段未完成'}</span>
        <span className="break-all font-mono">{imported?.runId ?? snapshot?.runId}</span>
      </div>
      {imported?.error && <p role="alert" className="break-words text-sm text-destructive">测量未完成：{imported.error}</p>}
      <StartupStages snapshot={snapshot} report={imported} />
      {snapshot && <>
        <section aria-labelledby="startup-tools-title" className="border-y border-border py-5">
          <h2 id="startup-tools-title" className="font-medium">后台工具观测</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">仅覆盖已接入工具。这里是就绪时的状态采样，不能代表工具完成初始化的精确时刻。</p>
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {Object.entries(snapshot.tools).map(([name, observation]) => <li key={name} className="flex gap-3">
              <span>{name}</span><span className={observation.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}>{statusLabels[observation.status]}</span>
            </li>)}
          </ul>
          {Object.keys(snapshot.tools).length === 0 && <p className="mt-3 text-sm text-muted-foreground">此进程尚未提供工具就绪观测。</p>}
        </section>
        <StartupSteps snapshot={snapshot} />
      </>}
    </>}
    <details className="border-t border-border pt-4 text-sm">
      <summary className="cursor-pointer font-medium focus-visible:outline-2">自动记录如何工作</summary>
      <p className="mt-3 leading-6 text-muted-foreground">使用 node forge.mjs start 从源码启动。监督流程自动记录 Maven 阶段，应用记录 JVM 和 Spring 阶段，本页直接读取，无需另外启动脚本或导入报告。</p>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">开发模式记录 Maven 开始到应用 JVM 启动的准备时间；完整模式记录 package 耗时。首次 API 时间包含就绪后的等待，不等于接口处理时长。导入导出仅用于保存和查看离线记录。</p>
    </details>
  </main>
}

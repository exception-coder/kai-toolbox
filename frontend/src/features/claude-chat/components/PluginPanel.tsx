import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authEventSource } from '@/lib/api'
import { getPluginStatus, PLUGIN_UPDATE_STREAM_PATH } from '../api'
import type { EnginePluginStatus, PluginStatus } from '../types'

/**
 * team-standards 插件面板:展示 Claude/Codex 两端版本 + 一键更新(SSE 实时回显)。
 * 更新走固定后端命令,非 AI 流。
 */
export function PluginPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<PluginStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const refresh = async () => {
    setLoading(true)
    try { setStatus(await getPluginStatus()) } catch { /* 静默 */ } finally { setLoading(false) }
  }

  useEffect(() => {
    void refresh()
    return () => esRef.current?.close()
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  const startUpdate = () => {
    if (updating) return
    setLines([]); setUpdating(true)
    const es = authEventSource(PLUGIN_UPDATE_STREAM_PATH)
    esRef.current = es
    es.onmessage = ev => {
      let m: { type: string; engine?: string; step?: string; text?: string; exitCode?: number; message?: string }
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.type === 'line') {
        setLines(prev => [...prev, `${m.engine ? `[${m.engine}] ` : ''}${m.text ?? ''}`])
      } else if (m.type === 'step') {
        setLines(prev => [...prev, `[${m.engine}] ${m.step} → exit ${m.exitCode}`])
      } else if (m.type === 'done') {
        setLines(prev => [...prev, '✓ 更新完成（Claude 需重启会话加载新版本）'])
        es.close(); setUpdating(false); void refresh()
      } else if (m.type === 'error') {
        setLines(prev => [...prev, `✖ ${m.message ?? '更新出错'}`])
        es.close(); setUpdating(false)
      }
    }
    es.onerror = () => {
      // 连接结束/出错:若仍在更新态则收尾(后端 complete 也会触发 onerror)
      es.close()
      setUpdating(prev => { if (prev) { setLines(l => [...l, '— 连接结束 —']); void refresh() } return false })
    }
  }

  return (
    <div className="border-b px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">插件版本（team-standards）</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={onClose} aria-label="关闭">
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <EngineCard name="Claude" s={status?.claude} />
        <EngineCard name="Codex" s={status?.codex} />
      </div>

      <Button size="sm" className="mt-3 w-full" onClick={startUpdate} disabled={updating}>
        <Download className="size-4" /> {updating ? '更新中…' : '一键更新双端插件'}
      </Button>

      {lines.length > 0 && (
        <pre ref={logRef} className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--color-muted)] p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

function EngineCard({ name, s }: { name: string; s?: EnginePluginStatus }) {
  const outdated = s && s.installed && s.available && s.installed !== s.available
  return (
    <div className="rounded-md border px-2 py-1.5 text-xs">
      <div className="font-medium">{name}</div>
      {!s ? (
        <div className="text-[var(--color-muted-foreground)]">加载中…</div>
      ) : s.error ? (
        <div className="text-[var(--color-destructive)]">{s.error}</div>
      ) : (
        <div className="text-[var(--color-muted-foreground)]">
          已装 <span className="text-[var(--color-foreground)]">{s.installed ?? '未安装'}</span>
          {s.available && <> · 最新 {s.available}</>}
          {outdated && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900 dark:text-amber-200">可更新</span>}
        </div>
      )}
    </div>
  )
}

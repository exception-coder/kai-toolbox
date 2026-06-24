import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authEventSource } from '@/lib/api'
import { listSuites, PLUGIN_UPDATE_STREAM_PATH } from '../api'
import type { SuiteStatus } from '../types'

/**
 * 团队套件面板：展示当前会话所用的 3 插件 + 2 MCP 版本/状态，并一键更新插件（SSE 实时回显）。
 * 团队插件均为 Claude Code 插件（codex 端无此 marketplace）；更新走固定后端命令、非 AI 流。
 */
export function PluginPanel({ onClose }: { onClose: () => void }) {
  const [suites, setSuites] = useState<SuiteStatus[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const refresh = async () => {
    setLoading(true)
    try { setSuites(await listSuites()) } catch { /* 静默 */ } finally { setLoading(false) }
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
        setLines(prev => [...prev, `${m.text ?? ''}`])
      } else if (m.type === 'step') {
        setLines(prev => [...prev, `${m.step} → exit ${m.exitCode}`])
      } else if (m.type === 'done') {
        setLines(prev => [...prev, '✓ 更新完成（重启 Claude Code 会话加载新版本）'])
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
        <span className="text-sm font-semibold">团队套件（当前会话所用）</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={onClose} aria-label="关闭">
          <X className="size-4" />
        </Button>
      </div>

      {suites == null ? (
        <div className="text-xs text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <ul className="space-y-1">
          {suites.map(p => {
            const outdated = p.kind === 'plugin' && p.installed && p.available && p.installed !== p.available
            return (
              <li key={`${p.kind}:${p.name}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                <span className={`shrink-0 rounded px-1 text-[10px] ${p.kind === 'mcp'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
                  {p.kind === 'mcp' ? 'MCP' : '插件'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.kind === 'plugin' ? (
                  !p.present ? (
                    <span className="shrink-0 text-[var(--color-destructive)]">未安装</span>
                  ) : (
                    <span className="shrink-0 text-right text-[var(--color-muted-foreground)]">
                      已装 <span className="text-[var(--color-foreground)]">{p.installed ?? '未知'}</span>
                      {p.available && <> · 最新 {p.available}</>}
                      {outdated && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900 dark:text-amber-200">可更新</span>}
                    </span>
                  )
                ) : (
                  <span className={`shrink-0 ${p.present ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-muted-foreground)]'}`}>
                    {p.present ? '✔ 已配置' : '未配置'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Button size="sm" className="mt-3 w-full" onClick={startUpdate} disabled={updating}>
        <Download className="size-4" /> {updating ? '更新中…' : '一键更新团队插件（Claude）'}
      </Button>
      <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
        更新 3 个 Claude 插件；MCP 由每日同步脚本 git pull 维护，不在此处更新。
      </p>

      {lines.length > 0 && (
        <pre ref={logRef} className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--color-muted)] p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

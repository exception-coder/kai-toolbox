import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { subscribeSse } from '@/lib/api'
import { closeStream, logStreamUrl } from '../api'

interface Props {
  hostId: string
  containerId: string | null
  onChangeContainerId: (cid: string | null) => void
}

const MAX_LINES = 5000

export function LogStreamPanel({ hostId, containerId, onChangeContainerId }: Props) {
  const [tail, setTail] = useState(200)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const streamIdRef = useRef<string | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const preRef = useRef<HTMLPreElement>(null)
  // 暂停状态用 ref，确保订阅回调读到的是最新值（避免闭包陷阱）
  const pausedRef = useRef(false)
  pausedRef.current = paused

  function stop() {
    if (closeRef.current) {
      closeRef.current()
      closeRef.current = null
    }
    if (streamIdRef.current) {
      closeStream(streamIdRef.current).catch(() => { /* 静默：可能已关 */ })
      streamIdRef.current = null
    }
    setRunning(false)
  }

  function start() {
    if (!containerId) return
    stop()
    setErr(null)
    setLines([])
    const url = logStreamUrl(hostId, containerId, tail)
    const close = subscribeSse(url, {
      onOpen: () => setRunning(true),
      onEvent: (name, data) => {
        if (name === 'ready' && data && typeof data === 'object' && 'streamId' in data) {
          streamIdRef.current = String((data as Record<string, unknown>).streamId)
        } else if (name === 'log' && data && typeof data === 'object' && 'data' in data) {
          if (pausedRef.current) return
          const decoded = b64ToUtf8(String((data as Record<string, unknown>).data))
          setLines(prev => {
            const next = prev.length >= MAX_LINES ? prev.slice(-MAX_LINES + 1) : prev.slice()
            next.push(decoded)
            return next
          })
        } else if (name === 'error') {
          setErr(typeof data === 'object' && data && 'message' in data
            ? String((data as Record<string, unknown>).message)
            : '日志流错误')
          stop()
        } else if (name === 'done') {
          setRunning(false)
        }
      },
      onError: e => {
        setErr(e instanceof Error ? e.message : 'SSE 连接断开')
        setRunning(false)
      },
    }, ['ready', 'log', 'heartbeat', 'done'])
    closeRef.current = close
  }

  useEffect(() => {
    // 切换 container 时主动停掉旧的
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, hostId])

  // 自动滚动到底部
  useEffect(() => {
    const el = preRef.current
    if (el && !pausedRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [lines])

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm">
          日志 {containerId && <Badge variant="outline" className="ml-2 text-[10px] font-mono">{containerId.slice(0, 12)}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Input className="w-32 h-8" placeholder="容器 ID"
                 value={containerId ?? ''}
                 onChange={e => onChangeContainerId(e.target.value || null)} />
          <Input className="w-20 h-8" type="number" min={0} max={5000}
                 value={tail} onChange={e => setTail(Number(e.target.value))} />
          {running ? (
            <Button size="sm" variant="destructive" onClick={stop}>停止</Button>
          ) : (
            <Button size="sm" disabled={!containerId} onClick={start}>开始</Button>
          )}
          <Button size="sm" variant="outline" disabled={!running}
                  onClick={() => setPaused(p => !p)}>
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {paused ? '继续' : '暂停'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLines([])}>
            <Trash2 className="size-3.5" /> 清空
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {err && (
          <div className="mb-2 text-xs text-red-500 border border-red-300 rounded px-2 py-1">{err}</div>
        )}
        <pre ref={preRef}
             className="bg-black text-green-400 text-[11px] font-mono p-2 rounded h-[500px] overflow-auto whitespace-pre-wrap">
          {lines.length === 0
            ? (running ? '(等待输出…)' : '点击「开始」订阅日志流')
            : lines.join('\n')}
        </pre>
        <div className="text-[10px] text-muted-foreground mt-1">
          {lines.length} 行（最大 {MAX_LINES} 行，超出从头滚动丢弃）
        </div>
      </CardContent>
    </Card>
  )
}

function b64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return b64
  }
}

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Circle, Loader2, PlayCircle, Search, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useRecordingStream } from '../hooks/useRecordingStream'
import { recordings as api } from '../api'
import { HttpCallCard } from './HttpCallCard'
import type { RecordingView, StartRecordingBody } from '../types'

/** 4 类资源的开关 + 默认勾选状态（与后端 RecordingService.start 兜底默认对齐）。 */
type CaptureKey = 'captureXhr' | 'captureFetch' | 'captureDocument' | 'captureScript'
const CAPTURE_OPTIONS: { key: CaptureKey; label: string; hint: string; default: boolean }[] = [
  { key: 'captureXhr',      label: 'XHR',      hint: '传统 Ajax 接口',            default: true  },
  { key: 'captureFetch',    label: 'Fetch',    hint: '现代 fetch API',           default: true  },
  { key: 'captureDocument', label: 'Document', hint: 'HTML 文档导航 / iframe',   default: false },
  { key: 'captureScript',   label: 'Script',   hint: 'JS 脚本资源（体积通常很大）', default: false },
]

/** 响应体截断位选项（字节）。后端硬上限默认 32 MB，超出会被夹回。 */
const BODY_LIMIT_OPTIONS = [
  { value: '256k', label: '256K', bytes: 256 * 1024 },
  { value: '2m',   label: '2M',   bytes: 2 * 1024 * 1024 },
  { value: '8m',   label: '8M',   bytes: 8 * 1024 * 1024 },
  { value: '32m',  label: '32M',  bytes: 32 * 1024 * 1024 },
] as const
type BodyLimitKey = typeof BODY_LIMIT_OPTIONS[number]['value']
const BODY_LIMIT_DEFAULT: BodyLimitKey = '2m'

interface Props {
  sessionId: string
  /** 用户点「去编排」时跳到编排页，把当前 recordingId 传过去 */
  onComposeFromRecording: (recordingId: string) => void
}

const RECORDINGS_KEY = (sid: string) => ['browser-request', 'recordings', sid] as const

export function RecordingPanel({ sessionId, onComposeFromRecording }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: list = [], isPending } = useQuery({
    queryKey: RECORDINGS_KEY(sessionId),
    queryFn: () => api.list(sessionId),
    refetchInterval: 3000,
  })

  const active = useMemo(() => list.find(r => r.status === 'RECORDING') ?? null, [list])
  const [viewingId, setViewingId] = useState<string | null>(null)

  // 当前选中的资源类型 4 个开关。active 录制不影响这里（这是「下次开录用什么」）
  const [captureFlags, setCaptureFlags] = useState<Record<CaptureKey, boolean>>(() =>
    Object.fromEntries(CAPTURE_OPTIONS.map(o => [o.key, o.default])) as Record<CaptureKey, boolean>,
  )
  const selectedCount = CAPTURE_OPTIONS.filter(o => captureFlags[o.key]).length
  // 响应体单条上限
  const [bodyLimit, setBodyLimit] = useState<BodyLimitKey>(BODY_LIMIT_DEFAULT)

  // 自动选中 active 录制供时间线订阅
  useEffect(() => {
    if (active) setViewingId(active.id)
    else if (!viewingId && list.length > 0) setViewingId(list[0].id)
  }, [active, list, viewingId])

  const startMut = useMutation({
    mutationFn: () => {
      const limitBytes = BODY_LIMIT_OPTIONS.find(o => o.value === bodyLimit)?.bytes
      const body: StartRecordingBody = {
        ...captureFlags,
        responseBodyTruncateAtBytes: limitBytes,
      }
      return api.start(sessionId, body)
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: RECORDINGS_KEY(sessionId) })
      setViewingId(r.id)
    },
  })
  const stopMut = useMutation({
    mutationFn: (id: string) => api.stop(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECORDINGS_KEY(sessionId) }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECORDINGS_KEY(sessionId) })
      setViewingId(null)
    },
  })

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          {active ? (
            <div className="flex items-center gap-3">
              <Circle className="size-4 animate-pulse text-red-500" fill="currentColor" />
              <div className="flex-1">
                <div className="text-sm font-medium">{active.name}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  正在录制 · {formatDuration(Date.now() - active.startedAt)} · {active.callCount} 个调用
                </div>
              </div>
              <Button onClick={() => stopMut.mutate(active.id)} disabled={stopMut.isPending} variant="destructive" size="lg" className="shadow-sm">
                {stopMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
                停止录制
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <div className="text-xs font-medium text-[var(--color-muted-foreground)]">
                    录哪些类型的请求（默认只录 Ajax 类，静态资源永不录）
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                    {CAPTURE_OPTIONS.map(opt => (
                      <label
                        key={opt.key}
                        className="flex cursor-pointer items-center gap-1.5 text-xs"
                        title={opt.hint}
                      >
                        <input
                          type="checkbox"
                          checked={captureFlags[opt.key]}
                          onChange={e =>
                            setCaptureFlags(prev => ({ ...prev, [opt.key]: e.target.checked }))
                          }
                          className="size-4 accent-[var(--color-primary)]"
                        />
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-[var(--color-muted-foreground)]">· {opt.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-xs font-medium text-[var(--color-muted-foreground)]"
                    title="单条响应体最多存到多少字节；超出会截断并标记。后端硬上限 32 MB。"
                  >
                    响应体上限
                  </span>
                  <Segmented<BodyLimitKey>
                    value={bodyLimit}
                    onChange={setBodyLimit}
                    options={BODY_LIMIT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  />
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    越大越完整，但会占更多 DB 空间、密集请求时浏览器可能轻微卡顿
                  </span>
                </div>
              </div>
              <Button
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending || selectedCount === 0}
                size="lg"
                className="shadow-sm"
                title={selectedCount === 0 ? '至少勾选一种资源类型' : '开始录制选中的资源类型'}
              >
                {startMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4 text-red-500" fill="currentColor" />}
                开始录制
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-3">
        {/* 录制历史列表 */}
        <Card className="col-span-4">
          <CardContent className="p-2">
            <div className="mb-2 text-xs font-medium">录制历史</div>
            {isPending && <div className="text-xs text-[var(--color-muted-foreground)]">加载中…</div>}
            {list.length === 0 && !isPending && (
              <div className="text-xs text-[var(--color-muted-foreground)]">还没有录制。</div>
            )}
            <ul className="space-y-1">
              {list.map(r => (
                <RecordingItem
                  key={r.id}
                  recording={r}
                  selected={r.id === viewingId}
                  onSelect={() => setViewingId(r.id)}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: '删除录制',
                      description: `「${r.name}」会被删除（含所有调用）。任务对此录制的引用会保留但变为 adhoc。`,
                      variant: 'destructive', confirmText: '删除',
                    })
                    if (ok) deleteMut.mutate(r.id)
                  }}
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 时间线 */}
        <div className="col-span-8">
          {viewingId
            ? <CallTimeline
                recordingId={viewingId}
                isActive={viewingId === active?.id}
                onCompose={() => onComposeFromRecording(viewingId)}
              />
            : <Card><CardContent className="p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                选一条录制查看时间线
              </CardContent></Card>}
        </div>
      </div>
    </div>
  )
}

function RecordingItem({
  recording, selected, onSelect, onDelete,
}: {
  recording: RecordingView
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const statusColor = {
    RECORDING: 'bg-red-500/20 text-red-700 dark:text-red-300',
    STOPPED: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
    AUTO_STOPPED: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    ABANDONED: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  }[recording.status]
  return (
    <li
      className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
        selected ? 'border-blue-500 ring-1 ring-blue-500/40' : ''
      }`}
    >
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="truncate font-medium">{recording.name}</div>
        <div className="text-[10px] text-[var(--color-muted-foreground)]">
          {new Date(recording.startedAt).toLocaleString()} · {recording.callCount} 调用
        </div>
      </button>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${statusColor}`}>
        {recording.status}
      </span>
      <Button size="sm" variant="ghost" onClick={onDelete} title="删除录制">
        <Trash2 className="size-3" />
      </Button>
    </li>
  )
}

function CallTimeline({
  recordingId, isActive, onCompose,
}: {
  recordingId: string
  isActive: boolean
  onCompose: () => void
}) {
  // SSE 流（仅 active 时订阅）
  const stream = useRecordingStream(isActive ? recordingId : null)
  // 非 active：拉历史 calls
  const { data: detail } = useQuery({
    queryKey: ['browser-request', 'recording-detail', recordingId, 'history'],
    queryFn: () => api.detail(recordingId, { withCalls: true, limit: 200 }),
    enabled: !isActive,
  })

  // active 时显示 SSE 累积；非 active 显示历史
  const calls = isActive ? stream.calls : (detail?.calls ?? [])

  // 响应体关键字检索（仅历史录制有 body 可搜）
  const [searchKw, setSearchKw] = useState('')
  const [onlyMatched, setOnlyMatched] = useState(false)
  const trimmedKw = searchKw.trim()
  const matchedIds = useMemo(() => {
    if (!trimmedKw) return new Set<string>()
    const kwLower = trimmedKw.toLowerCase()
    const hits = new Set<string>()
    for (const c of calls) {
      const body = (c as { responseBody?: string | null }).responseBody
      if (typeof body === 'string' && body.toLowerCase().includes(kwLower)) {
        hits.add(c.id)
      }
    }
    return hits
  }, [calls, trimmedKw])
  const visibleCalls = onlyMatched && trimmedKw ? calls.filter(c => matchedIds.has(c.id)) : calls

  return (
    <Card>
      <CardContent className="p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">时间线</span>
          <span className="text-[var(--color-muted-foreground)]">
            ({calls.length} 个调用{!isActive && detail && detail.callsHasMore ? '+，已截到前 200' : ''})
          </span>
          {isActive && <Badge variant="default">实时</Badge>}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <Input
                value={searchKw}
                onChange={e => setSearchKw(e.target.value)}
                placeholder={isActive ? '停止录制后可搜响应体' : '搜响应体关键字…'}
                disabled={isActive}
                className="h-8 w-56 pl-7 text-xs"
              />
            </div>
            {trimmedKw && (
              <>
                <span className="whitespace-nowrap text-[var(--color-muted-foreground)]">
                  命中 {matchedIds.size} / {calls.length}
                </span>
                <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={onlyMatched}
                    onChange={e => setOnlyMatched(e.target.checked)}
                    className="size-3.5 accent-[var(--color-primary)]"
                  />
                  仅显示命中
                </label>
              </>
            )}
            <Button size="sm" onClick={onCompose} disabled={calls.length === 0}>
              <PlayCircle className="size-4" />
              用这些调用编排
            </Button>
          </div>
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-auto">
          {visibleCalls.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
              {calls.length === 0
                ? (isActive ? '在打开的浏览器里点操作，调用会出现在这里…' : '这次录制没有调用')
                : '没有响应体命中该关键字'}
            </div>
          )}
          {visibleCalls.map(c => (
            <HttpCallCard
              key={c.id}
              call={c}
              highlight={matchedIds.has(c.id)}
              searchKeyword={trimmedKw || undefined}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

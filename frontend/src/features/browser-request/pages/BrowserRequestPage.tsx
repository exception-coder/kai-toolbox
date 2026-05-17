import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark, CheckCircle2, Circle, Copy, Disc3, Download, FolderOpen, Globe, KeyRound, Loader2,
  Play, Plus, Power, RefreshCcw, Square, Trash2, Upload, XCircle,
} from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import {
  captureStatus, clearStorage, closeSession, createSession, deleteSession, deleteSavedRequest,
  executeRequest, listSavedRequests, listSessions, openSession, saveRequest, saveStorage,
  startCapture, stopCapture,
} from '../api'
import type { CaptureStatusView, ExecutedResponse, SavedRequestView, SessionView } from '../types'

const SESSIONS_KEY = ['browser-request', 'sessions'] as const

export function BrowserRequestPage() {
  const qc = useQueryClient()
  const { data: sessions = [], isFetching } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: listSessions,
    refetchInterval: 5000,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => sessions.find(s => s.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  useEffect(() => {
    if (!selectedId && sessions.length > 0) setSelectedId(sessions[0].id)
  }, [sessions, selectedId])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <Globe className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">浏览器请求</h1>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            打开站点 → 在弹出的浏览器里登录 → 保存登录态 → 粘贴 curl 或填写请求 → 在同一会话内重放
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: SESSIONS_KEY })}>
            <RefreshCcw className={isFetching ? 'animate-spin' : ''} />
            刷新
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[320px_1fr] gap-4 overflow-hidden">
        <SessionList
          sessions={sessions}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="overflow-auto">
          {selected
            ? <SessionDetail session={selected} />
            : <EmptyState />}
        </div>
      </div>
    </div>
  )
}

// ── 会话列表 ──────────────────────────────────────────────────────────────────

function SessionList({
  sessions, selectedId, onSelect,
}: {
  sessions: SessionView[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const createMut = useMutation({
    mutationFn: () => createSession(name, url),
    onSuccess: created => {
      qc.invalidateQueries({ queryKey: SESSIONS_KEY })
      onSelect(created.id)
      setName(''); setUrl('')
    },
  })

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-[var(--color-card)] p-3">
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--color-muted-foreground)]">新建会话</div>
        <Input placeholder="会话名（可选）" value={name} onChange={e => setName(e.target.value)} />
        <Input placeholder="https://your-site.com" value={url} onChange={e => setUrl(e.target.value)} />
        <Button
          size="sm" className="w-full"
          disabled={!url.trim() || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          新建
        </Button>
        {createMut.error && (
          <div className="text-xs text-[var(--color-destructive)]">
            {(createMut.error as Error).message}
          </div>
        )}
      </div>

      <div className="h-px bg-[var(--color-border)]" />

      <div className="flex-1 space-y-1 overflow-auto">
        {sessions.length === 0 && (
          <div className="rounded-md p-3 text-center text-xs text-[var(--color-muted-foreground)]">
            还没有会话
          </div>
        )}
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full rounded-md border px-2 py-2 text-left text-sm transition-colors ${
              selectedId === s.id
                ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                : 'border-transparent hover:bg-[var(--color-accent)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {s.active
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                : <Circle className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />}
              <span className="truncate font-medium">{s.name}</span>
              {s.hasStorage && <Badge variant="secondary" className="ml-auto">已登录</Badge>}
            </div>
            <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
              {s.url}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 会话详情：操作 + 请求编辑器 + 响应 ───────────────────────────────────────

function SessionDetail({ session }: { session: SessionView }) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: SESSIONS_KEY })

  const openMut = useMutation({ mutationFn: () => openSession(session.id), onSuccess: refresh })
  const saveMut = useMutation({ mutationFn: () => saveStorage(session.id), onSuccess: refresh })
  const clearMut = useMutation({ mutationFn: () => clearStorage(session.id), onSuccess: refresh })
  const closeMut = useMutation({ mutationFn: () => closeSession(session.id), onSuccess: refresh })
  const delMut = useMutation({ mutationFn: () => deleteSession(session.id), onSuccess: refresh })

  // 父组件持有「待载入到编辑器」的快照，点击历史条目时更新；
  // RequestExecutor 用 useEffect 监听这个 prop 来同步内部 state。
  const [initial, setInitial] = useState<SavedRequestView | null>(null)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-[var(--color-card)] p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{session.name}</h2>
              {session.active
                ? <Badge>窗口已打开</Badge>
                : <Badge variant="secondary">未打开</Badge>}
              {session.hasStorage && <Badge variant="outline">登录态已保存</Badge>}
            </div>
            <div className="mt-1 truncate text-sm text-[var(--color-muted-foreground)]">
              {session.url}
            </div>
            <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {session.storageSavedAt
                ? `登录态：${formatBytes(session.storageBytes ?? 0)} · ${formatRelativeTime(session.storageSavedAt)}保存`
                : '登录态：尚未保存（登录后 30 秒内会自动落盘，或点关闭/保存登录态强制写盘）'}
            </div>
          </div>
          <Button
            size="sm" variant="destructive"
            onClick={() => {
              if (confirm(`删除会话「${session.name}」？登录态文件会一并清掉。`)) delMut.mutate()
            }}
            disabled={delMut.isPending}
          >
            <Trash2 />
            删除
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => openMut.mutate()} disabled={openMut.isPending}>
            {openMut.isPending ? <Loader2 className="animate-spin" /> : <Power />}
            打开 / 重新导航
          </Button>
          <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={!session.active || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            保存登录态
          </Button>
          <Button size="sm" variant="outline" onClick={() => closeMut.mutate()} disabled={!session.active || closeMut.isPending}>
            <XCircle />
            关闭窗口
          </Button>
          <Button size="sm" variant="ghost" onClick={() => clearMut.mutate()} disabled={!session.hasStorage || clearMut.isPending}>
            清除登录态
          </Button>
        </div>

        {openMut.error && <ErrorLine err={openMut.error} />}
        {saveMut.error && <ErrorLine err={saveMut.error} />}
        {clearMut.error && <ErrorLine err={clearMut.error} />}
      </div>

      <JsCapturePanel sessionId={session.id} sessionActive={session.active} />
      <SavedRequestPanel sessionId={session.id} onLoad={setInitial} />
      <RequestExecutor session={session} initial={initial} />
    </div>
  )
}

// ── JS 捕获面板 ──────────────────────────────────────────────────────────────

const CAPTURE_KEY = (sid: string) => ['browser-request', 'capture', sid] as const

function JsCapturePanel({
  sessionId, sessionActive,
}: {
  sessionId: string
  sessionActive: boolean
}) {
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: CAPTURE_KEY(sessionId),
    queryFn: () => captureStatus(sessionId),
    refetchInterval: 2000,
  })
  const startMut = useMutation({
    mutationFn: () => startCapture(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAPTURE_KEY(sessionId) }),
  })
  const stopMut = useMutation({
    mutationFn: () => stopCapture(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAPTURE_KEY(sessionId) }),
  })
  const active = status?.active ?? false

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Disc3 className={`h-4 w-4 ${active ? 'animate-spin text-red-500' : ''}`} />
        <div className="text-sm font-medium">JS 捕获</div>
        {active
          ? <Badge variant="destructive">录制中 · {status?.capturedCount ?? 0} 个</Badge>
          : <Badge variant="secondary">未开始</Badge>}
      </div>
      <div className="text-xs text-[var(--color-muted-foreground)]">
        开启后，会话内所有 .js 响应自动落盘到下面的目录，便于离线分析反爬脚本。
        登录、浏览几个页面后再停止，{`{目录}`}/scripts 下就是所有抓到的 JS，{`manifest.json`} 记录原始 URL。
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!active ? (
          <Button
            size="sm"
            onClick={() => startMut.mutate()}
            disabled={!sessionActive || startMut.isPending}
            title={!sessionActive ? '需要先打开会话窗口' : '开始捕获本会话的所有 JS'}
          >
            {startMut.isPending ? <Loader2 className="animate-spin" /> : <Disc3 />}
            开始捕获
          </Button>
        ) : (
          <Button
            size="sm" variant="destructive"
            onClick={() => stopMut.mutate()}
            disabled={stopMut.isPending}
          >
            {stopMut.isPending ? <Loader2 className="animate-spin" /> : <Square />}
            停止
          </Button>
        )}
        {status?.directory && (
          <Button
            size="sm" variant="outline"
            onClick={() => navigator.clipboard?.writeText(status.directory).catch(() => {})}
            title={`复制路径到剪贴板：${status.directory}`}
          >
            <FolderOpen />
            复制目录路径
          </Button>
        )}
      </div>
      {status?.directory && (
        <div className="mt-2 break-all rounded bg-[var(--color-muted)] p-2 font-mono text-xs">
          {status.directory}
        </div>
      )}
    </div>
  )
}

// ── 已保存的请求 ─────────────────────────────────────────────────────────────

const SAVED_KEY = (sid: string) => ['browser-request', 'saved', sid] as const

function SavedRequestPanel({
  sessionId, onLoad,
}: {
  sessionId: string
  onLoad: (req: SavedRequestView) => void
}) {
  const qc = useQueryClient()
  const { data: saved = [], isFetching } = useQuery({
    queryKey: SAVED_KEY(sessionId),
    queryFn: () => listSavedRequests(sessionId),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteSavedRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SAVED_KEY(sessionId) }),
  })

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bookmark className="h-4 w-4" />
        <div className="text-sm font-medium">已保存的请求</div>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {saved.length} 条
        </span>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-[var(--color-muted-foreground)]" />}
      </div>
      {saved.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
          还没有收藏的请求。在下方编辑器里粘贴 cURL 或填写请求后，点「保存」就会出现在这里。
        </div>
      ) : (
        <ul className="space-y-1">
          {saved.map(r => (
            <li key={r.id} className="flex items-center gap-2 rounded-md border p-2 hover:bg-[var(--color-accent)]">
              <button
                onClick={() => onLoad(r)}
                className="min-w-0 flex-1 text-left"
                title="点击载入到下方编辑器"
              >
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                  {summarize(r)}
                </div>
              </button>
              <Button size="sm" variant="ghost" onClick={() => onLoad(r)} title="载入到编辑器">
                <Upload />
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => { if (confirm(`删除「${r.name}」？`)) delMut.mutate(r.id) }}
                disabled={delMut.isPending}
                title="删除"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function summarize(r: SavedRequestView): string {
  if (r.url) return `${(r.method ?? 'GET').toUpperCase()} ${r.url}`
  if (r.curl) return r.curl.replace(/\s+/g, ' ').slice(0, 120)
  return '(空)'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return new Date(epochMs).toLocaleString()
}

function ErrorLine({ err }: { err: unknown }) {
  return (
    <div className="mt-2 text-xs text-[var(--color-destructive)]">
      {err instanceof ApiError ? err.message : (err as Error).message}
    </div>
  )
}

// ── 请求执行器 ────────────────────────────────────────────────────────────────

const SAMPLE = `# 粘贴一个 curl 命令（Chrome DevTools → Network → Copy as cURL），或切换 JSON 模式
curl 'https://your-site.com/api/me' -H 'Accept: application/json'`

function RequestExecutor({
  session, initial,
}: {
  session: SessionView
  initial: SavedRequestView | null
}) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'curl' | 'raw'>('curl')
  const [curl, setCurl] = useState('')
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('Accept: application/json')
  const [body, setBody] = useState('')
  const [resp, setResp] = useState<ExecutedResponse | null>(null)
  // 当前编辑器内容对应的已保存条目，用于「另存为新条目」时给出默认名字。
  const [loadedFrom, setLoadedFrom] = useState<SavedRequestView | null>(null)

  // 把外部传入的「待载入」快照同步到内部 state。
  // 比较 id 防止用户编辑后又被同一份快照覆盖。
  useEffect(() => {
    if (!initial) return
    if (loadedFrom?.id === initial.id) return
    if (initial.curl) {
      setMode('curl'); setCurl(initial.curl)
      setMethod('GET'); setUrl(''); setHeadersText(''); setBody('')
    } else {
      setMode('raw'); setCurl('')
      setMethod(initial.method ?? 'GET')
      setUrl(initial.url ?? '')
      setHeadersText(
        Object.entries(initial.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
      )
      setBody(initial.body ?? '')
    }
    setLoadedFrom(initial)
    setResp(null)
  }, [initial, loadedFrom?.id])

  const execMut = useMutation({
    mutationFn: () => {
      if (mode === 'curl') {
        return executeRequest(session.id, { curl })
      }
      return executeRequest(session.id, {
        method, url, headers: parseHeaders(headersText), body: body || undefined,
      })
    },
    onSuccess: r => setResp(r),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const defaultName = mode === 'curl'
        ? (curl.split(/\s+/).find(s => s.startsWith('http')) ?? 'cURL 请求')
        : `${method} ${url}`
      const name = prompt('保存为：', loadedFrom?.name ?? defaultName)
      if (name == null) return Promise.reject(new Error('__cancelled__'))
      const payload = mode === 'curl'
        ? { name, curl }
        : { name, method, url, headers: parseHeaders(headersText), body: body || undefined }
      return saveRequest(session.id, payload)
    },
    onSuccess: (created) => {
      setLoadedFrom(created)
      qc.invalidateQueries({ queryKey: SAVED_KEY(session.id) })
    },
  })

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm font-medium">请求</div>
        <div className="ml-auto flex rounded-md border p-0.5 text-xs">
          {(['curl', 'raw'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-1 ${mode === m ? 'bg-[var(--color-accent)]' : ''}`}
            >
              {m === 'curl' ? 'cURL 粘贴' : '结构化'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'curl' ? (
        <textarea
          className="min-h-[120px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
          placeholder={SAMPLE}
          value={curl}
          onChange={e => setCurl(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              className="rounded-md border bg-[var(--color-background)] px-2 text-sm"
              value={method}
              onChange={e => setMethod(e.target.value)}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(m => <option key={m}>{m}</option>)}
            </select>
            <Input placeholder="https://your-site.com/api/..." value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
            placeholder="Header-Name: value（一行一个）"
            value={headersText}
            onChange={e => setHeadersText(e.target.value)}
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
            placeholder="请求体（GET/HEAD 留空）"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => execMut.mutate()}
          disabled={execMut.isPending || (mode === 'curl' ? !curl.trim() : !url.trim())}
        >
          {execMut.isPending ? <Loader2 className="animate-spin" /> : <Play />}
          执行
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || (mode === 'curl' ? !curl.trim() : !url.trim())}
          title="把当前请求保存到此会话的收藏列表"
        >
          {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Bookmark />}
          保存
        </Button>
        {loadedFrom && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            已载入：{loadedFrom.name}
          </span>
        )}
        {!session.active && (
          <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
            会话未打开也可执行——后端会用磁盘上的登录态在 APIRequestContext 重放。
          </span>
        )}
        {execMut.error && <ErrorLine err={execMut.error} />}
        {saveMut.error && (saveMut.error as Error).message !== '__cancelled__'
          && <ErrorLine err={saveMut.error} />}
      </div>

      {resp && <ResponseView resp={resp} />}
    </div>
  )
}

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

/** 启用语言扩展（高亮 + 折叠 + 自动缩进）的体积上限，超过则降级为纯文本。 */
const HIGHLIGHT_MAX_BYTES = 2 * 1024 * 1024
/** JSON 美化体积上限。V8 的 JSON.parse+stringify 在 8MB 内主线程耗时约 200-500ms 可接受。 */
const PRETTY_MAX_BYTES = 8 * 1024 * 1024
/** 完全放弃渲染的体积上限，超过则只给下载/复制按钮。 */
const RENDER_GIVEUP_BYTES = 30 * 1024 * 1024

/** 订阅 <html> 上的 dark 类切换，让 CodeMirror 主题跟随项目主题。 */
function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/** 字号对齐项目其他 pre 块的 12px。 */
const cmFontTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
})

function ResponseView({ resp }: { resp: ExecutedResponse }) {
  const dark = useIsDarkTheme()
  const headerLookup = useMemo(() => {
    const m: Record<string, string> = {}
    for (const [k, v] of Object.entries(resp.headers)) m[k.toLowerCase()] = v
    return m
  }, [resp.headers])
  const ct = headerLookup['content-type']?.toLowerCase() ?? ''
  const kind: 'json' | 'xml' | 'html' | 'text' =
    ct.includes('json') ? 'json'
    : ct.includes('html') ? 'html'
    : ct.includes('xml') ? 'xml'
    : 'text'

  const { displayBody, prettified, tooLargeToRender, highlightOn } = useMemo(() => {
    const raw = resp.body ?? ''
    const len = raw.length
    if (len > RENDER_GIVEUP_BYTES) {
      return { displayBody: '', prettified: false, tooLargeToRender: true, highlightOn: false }
    }
    let pretty: string | null = null
    if (kind === 'json' && len <= PRETTY_MAX_BYTES) {
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2) } catch { /* keep raw */ }
    }
    const full = pretty ?? raw
    return {
      displayBody: full,
      prettified: pretty !== null,
      tooLargeToRender: false,
      highlightOn: full.length <= HIGHLIGHT_MAX_BYTES,
    }
  }, [resp.body, kind])

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [cmFontTheme, EditorView.lineWrapping]
    if (highlightOn) {
      if (kind === 'json') exts.push(json())
      else if (kind === 'xml') exts.push(xml())
      else if (kind === 'html') exts.push(html())
    }
    return exts
  }, [kind, highlightOn])

  const statusColor =
    resp.status >= 500 ? 'text-red-500'
    : resp.status >= 400 ? 'text-orange-500'
    : resp.status >= 300 ? 'text-yellow-500'
    : 'text-green-500'

  const download = () => {
    const ext = kind === 'json' ? 'json' : kind === 'xml' ? 'xml' : kind === 'html' ? 'html' : 'txt'
    const mime = kind === 'json' ? 'application/json'
      : kind === 'xml' ? 'application/xml'
      : kind === 'html' ? 'text/html' : 'text/plain'
    const blob = new Blob([resp.body ?? ''], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `response-${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }
  const copy = () => {
    navigator.clipboard?.writeText(resp.body ?? '').catch(() => { /* ignore */ })
  }

  return (
    <div className="mt-4 space-y-2 rounded-md border bg-[var(--color-background)] p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`font-semibold ${statusColor}`}>{resp.status} {resp.statusText}</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          · {resp.rawBodyLength.toLocaleString()} bytes
          {prettified && ' · JSON 已格式化'}
          {!highlightOn && !tooLargeToRender && ' · 关闭高亮（大文本保护）'}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={copy} title="复制完整响应体">
            <Copy />
          </Button>
          <Button size="sm" variant="ghost" onClick={download} title="下载完整响应体">
            <Download />
          </Button>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
          响应头（{Object.keys(resp.headers).length}）
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs">
{Object.entries(resp.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
        </pre>
      </details>
      {tooLargeToRender ? (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs">
          响应体超过 {(RENDER_GIVEUP_BYTES / 1024 / 1024).toFixed(0)} MB，跳过页内渲染。
          点右上角下载到本地查看。
        </div>
      ) : displayBody ? (
        <CodeMirror
          value={displayBody}
          extensions={extensions}
          theme={dark ? 'dark' : 'light'}
          readOnly
          editable={false}
          maxHeight="480px"
          basicSetup={{
            lineNumbers: true,
            foldGutter: highlightOn,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
            indentOnInput: false,
          }}
        />
      ) : (
        <div className="rounded bg-[var(--color-muted)] p-2 text-xs text-[var(--color-muted-foreground)]">
          (空响应体)
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
      <div>
        <Globe className="mx-auto mb-2 h-8 w-8 opacity-50" />
        左侧创建一个会话——填入要登录的站点 URL，然后点「打开」会弹出真实浏览器供你登录。
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark, CheckCircle2, Circle, Copy, Disc3, Download, FolderOpen, Globe, KeyRound, Loader2,
  Pencil, Play, Plus, Power, RefreshCcw, Save, Square, Trash2, Upload, Variable, XCircle,
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
import { Segmented } from '@/components/ui/segmented'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { usePrompt } from '@/components/ui/prompt-dialog'
import {
  captureStatus, clearStorage, closeSession, createSession, deleteSession, deleteSavedRequest,
  deleteVar, executeRequest, extractToSaved, listSavedRequests, listSessions, listVars, openSession,
  saveRequest, saveStorage, startCapture, stopCapture, updateSavedRequest, upsertVar,
} from '../api'
import type {
  CaptureStatusView, ExecuteRequestBody, ExecutedResponse, OutputSpec, SavedRequestView, SessionView,
  VarView,
} from '../types'
import { evalJsonPath, stringifyForVar } from '../utils/jsonpath'
import { ForeachPanel } from '../components/ForeachPanel'
import { PipelinePanel } from '../components/PipelinePanel'
import { OutputsEditor } from '../components/OutputsEditor'

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
  const confirm = useConfirm()
  const refresh = () => qc.invalidateQueries({ queryKey: SESSIONS_KEY })

  const openMut = useMutation({ mutationFn: () => openSession(session.id), onSuccess: refresh })
  const saveMut = useMutation({ mutationFn: () => saveStorage(session.id), onSuccess: refresh })
  const clearMut = useMutation({ mutationFn: () => clearStorage(session.id), onSuccess: refresh })
  const closeMut = useMutation({ mutationFn: () => closeSession(session.id), onSuccess: refresh })
  const delMut = useMutation({ mutationFn: () => deleteSession(session.id), onSuccess: refresh })

  // 父组件持有「待载入到编辑器」的快照，点击历史条目时更新；
  // RequestExecutor 用 useEffect 监听这个 prop 来同步内部 state。
  const [initial, setInitial] = useState<SavedRequestView | null>(null)
  // RequestExecutor 把当前编辑器内容/最近响应实时同步上来，供「批量执行」面板复用。
  const [currentRequest, setCurrentRequest] = useState<ExecuteRequestBody | null>(null)
  const [lastResponseBody, setLastResponseBody] = useState<string | null>(null)

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
            onClick={async () => {
              const ok = await confirm({
                title: '删除会话',
                description: `确认删除会话「${session.name}」？登录态文件会一并清掉，不可恢复。`,
                variant: 'destructive',
                confirmText: '删除',
              })
              if (ok) delMut.mutate()
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

      <SessionTabs
        session={session}
        initial={initial}
        setInitial={setInitial}
        setCurrentRequest={setCurrentRequest}
        setLastResponseBody={setLastResponseBody}
        currentRequest={currentRequest}
        lastResponseBody={lastResponseBody}
      />
    </div>
  )
}

// ── 会话内 Tab 切换器 ───────────────────────────────────────────────────────

type SessionTabKey = 'request' | 'pipeline' | 'capture'

const SESSION_TAB_OPTIONS = [
  { value: 'request' as const,  label: '请求 / 变量' },
  { value: 'pipeline' as const, label: '批量 / 编排' },
  { value: 'capture' as const,  label: 'JS 捕获' },
]

/**
 * 各 Tab 用 `hidden` 切换显示而非条件渲染——保留所有子组件 mount，避免切走再回来
 * 丢失 RequestExecutor 的草稿、运行中的 PipelineRunView 进度等内部 state。
 */
function SessionTabs({
  session, initial, setInitial, setCurrentRequest, setLastResponseBody,
  currentRequest, lastResponseBody,
}: {
  session: SessionView
  initial: SavedRequestView | null
  setInitial: (v: SavedRequestView | null) => void
  setCurrentRequest: (v: ExecuteRequestBody | null) => void
  setLastResponseBody: (v: string | null) => void
  currentRequest: ExecuteRequestBody | null
  lastResponseBody: string | null
}) {
  const [tab, setTab] = useState<SessionTabKey>('request')
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-[var(--color-background)]/95 px-1 py-1 backdrop-blur">
        <Segmented<SessionTabKey>
          value={tab}
          onChange={setTab}
          options={SESSION_TAB_OPTIONS}
          size="md"
        />
      </div>

      <div hidden={tab !== 'request'} className="space-y-4">
        <SavedRequestPanel sessionId={session.id} onLoad={setInitial} />
        <RequestExecutor
          session={session}
          initial={initial}
          onRequestChange={setCurrentRequest}
          onResponseChange={setLastResponseBody}
        />
        {/* 旧变量池：仅当还有数据时显示，引导用户迁移到 saved 上 */}
        <LegacyVarsPanel sessionId={session.id} />
      </div>

      <div hidden={tab !== 'pipeline'} className="space-y-4">
        <ForeachPanel
          sessionId={session.id}
          currentRequest={currentRequest}
          lastResponseBody={lastResponseBody}
        />
        <PipelinePanel sessionId={session.id} />
      </div>

      <div hidden={tab !== 'capture'}>
        <JsCapturePanel sessionId={session.id} sessionActive={session.active} />
      </div>
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

// ── 变量池 ────────────────────────────────────────────────────────────────────

const VARS_KEY = (sid: string) => ['browser-request', 'vars', sid] as const

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function VarsPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const promptInput = usePrompt()
  const { data: vars = [] } = useQuery({
    queryKey: VARS_KEY(sessionId),
    queryFn: () => listVars(sessionId),
  })

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: VARS_KEY(sessionId) })

  const upsertMut = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) =>
      upsertVar(sessionId, name, value),
    onSuccess: refresh,
  })
  const delMut = useMutation({
    mutationFn: (name: string) => deleteVar(sessionId, name),
    onSuccess: refresh,
  })

  const submitAdd = () => {
    if (!VAR_NAME_RE.test(newName)) return
    upsertMut.mutate({ name: newName, value: newValue }, {
      onSuccess: () => {
        setAdding(false); setNewName(''); setNewValue('')
      },
    })
  }

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Variable className="h-4 w-4" />
        <div className="text-sm font-medium">变量池</div>
        <span className="text-xs text-[var(--color-muted-foreground)]">{vars.length} 个</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          · 在请求里用 <code>{'{{name}}'}</code> 引用
        </span>
        <div className="ml-auto">
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              添加
            </Button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mb-2 space-y-2 rounded-md border border-dashed p-2">
          <div className="flex gap-2">
            <Input
              className="w-40"
              placeholder="变量名 (myToken)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <Input
              placeholder="值"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
            />
          </div>
          {newName && !VAR_NAME_RE.test(newName) && (
            <div className="text-xs text-[var(--color-destructive)]">
              名字只能含字母 / 数字 / 下划线，且不能以数字开头
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={submitAdd}
                    disabled={!VAR_NAME_RE.test(newName) || upsertMut.isPending}>
              <Save />
              保存
            </Button>
            <Button size="sm" variant="ghost"
                    onClick={() => { setAdding(false); setNewName(''); setNewValue('') }}>
              取消
            </Button>
          </div>
        </div>
      )}

      {vars.length === 0 && !adding && (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
          还没有变量。可以「+ 添加」手动新建，或在响应面板点「提取为变量」从 JSON 字段挑值。
        </div>
      )}

      {vars.length > 0 && (
        <ul className="space-y-1">
          {vars.map(v => (
            <li key={v.name}
                className="flex items-center gap-2 rounded-md border p-2 hover:bg-[var(--color-accent)]">
              <span className="w-32 shrink-0 truncate font-mono text-xs font-semibold">{v.name}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-muted-foreground)]"
                    title={v.value}>
                {v.value || '(空)'}
              </span>
              <Button
                size="sm" variant="ghost"
                title="编辑值"
                onClick={async () => {
                  const v2 = await promptInput({
                    title: `编辑变量 ${v.name}`,
                    description: '这条变量在请求里以 {{' + v.name + '}} 引用。',
                    defaultValue: v.value,
                    confirmText: '保存',
                    validate: () => null,
                  })
                  if (v2 != null) upsertMut.mutate({ name: v.name, value: v2 })
                }}
              >
                <Pencil />
              </Button>
              <Button
                size="sm" variant="ghost"
                title="删除"
                onClick={async () => {
                  const ok = await confirm({
                    title: '删除变量',
                    description: `确认删除 {{${v.name}}}？引用它的请求执行时会报错。`,
                    variant: 'destructive',
                    confirmText: '删除',
                  })
                  if (ok) delMut.mutate(v.name)
                }}
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

/**
 * 旧版变量池——历史遗留数据兼容显示。新方案下变量都绑到 SavedRequest 上。
 * 仅当确实有 legacy 数据时才渲染；用户能删但不能新增（"+ 添加"按钮去掉）。
 */
function LegacyVarsPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data: vars = [] } = useQuery({
    queryKey: VARS_KEY(sessionId),
    queryFn: () => listVars(sessionId),
  })
  const delMut = useMutation({
    mutationFn: (name: string) => deleteVar(sessionId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: VARS_KEY(sessionId) }),
  })
  if (vars.length === 0) return null
  return (
    <div className="rounded-xl border border-dashed bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Variable className="h-4 w-4" />
        <div className="text-sm font-medium">会话变量（旧）</div>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {vars.length} 条 · 历史遗留——请改用「已保存请求」的输出配置
        </span>
      </div>
      <ul className="space-y-1">
        {vars.map(v => (
          <li key={v.name}
              className="flex items-center gap-2 rounded-md border p-2">
            <span className="w-32 shrink-0 truncate font-mono text-xs font-semibold">{v.name}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-muted-foreground)]"
                  title={v.value}>
              {v.value || '(空)'}
            </span>
            <Button
              size="sm" variant="ghost" title="删除"
              onClick={async () => {
                const ok = await confirm({
                  title: '删除遗留变量',
                  description: `确认删除 {{${v.name}}}？引用它的请求执行时会报错。`,
                  variant: 'destructive', confirmText: '删除',
                })
                if (ok) delMut.mutate(v.name)
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
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
  const confirm = useConfirm()
  const { data: saved = [], isFetching } = useQuery({
    queryKey: SAVED_KEY(sessionId),
    queryFn: () => listSavedRequests(sessionId),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteSavedRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SAVED_KEY(sessionId) }),
    onError: async e => {
      await confirm({
        title: '删除失败',
        description: (e as Error).message,
        confirmText: '知道了',
        cancelText: '关闭',
      })
    },
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
            <li key={r.id} className="rounded-md border hover:bg-[var(--color-accent)]">
              <div className="flex items-center gap-2 p-2">
                <button
                  onClick={() => onLoad(r)}
                  className="min-w-0 flex-1 text-left"
                  title="点击载入到下方编辑器"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {r.outputs && r.outputs.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.outputs.length} 个输出
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {summarize(r)}
                  </div>
                </button>
                <Button size="sm" variant="ghost"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        title="编辑输出配置">
                  <Pencil />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onLoad(r)} title="载入到编辑器">
                  <Upload />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除收藏',
                      description: `确认删除「${r.name}」？`,
                      variant: 'destructive',
                      confirmText: '删除',
                    })
                    if (ok) delMut.mutate(r.id)
                  }}
                  disabled={delMut.isPending}
                  title="删除"
                >
                  <Trash2 />
                </Button>
              </div>
              {/* 已配的输出 + 最近一次提取值 —— 即使未展开也直接显示，让"这条请求的出参"一目了然 */}
              {r.outputs && r.outputs.length > 0 && (
                <ul className="space-y-0.5 border-t bg-[var(--color-muted)]/30 px-2 py-1.5">
                  {r.outputs.map(o => {
                    const v = r.lastExtractedValues?.[o.name]
                    return (
                      <li key={o.name} className="flex items-baseline gap-2 text-xs">
                        <code className="w-24 shrink-0 truncate font-mono font-semibold">{o.name}</code>
                        <code className="w-32 shrink-0 truncate text-[var(--color-muted-foreground)]" title={o.jsonPath}>
                          {o.jsonPath}
                        </code>
                        <span className="min-w-0 flex-1 truncate font-mono" title={v}>
                          {v != null ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : (
                            <span className="text-[var(--color-muted-foreground)]">（尚未提取过）</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {expandedId === r.id && (
                <SavedRequestOutputsEditor
                  sessionId={sessionId}
                  saved={r}
                  onDone={() => setExpandedId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 已保存请求的 outputs 内联编辑器——展开后显示，编辑完成调 updateSavedRequest 落库。
 * 用「本地草稿 + 显式保存按钮」而非每键即写，避免每次输入都发请求。
 */
function SavedRequestOutputsEditor({
  sessionId, saved, onDone,
}: {
  sessionId: string
  saved: SavedRequestView
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<OutputSpec[]>(saved.outputs ?? [])
  const saveMut = useMutation({
    mutationFn: () => updateSavedRequest(saved.id, {
      name: saved.name,
      curl: saved.curl ?? undefined,
      method: saved.method ?? undefined,
      url: saved.url ?? undefined,
      headers: saved.headers,
      body: saved.body ?? undefined,
      outputs: draft,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_KEY(sessionId) })
      onDone()
    },
  })

  return (
    <div className="space-y-2 border-t bg-[var(--color-background)] p-3">
      <OutputsEditor
        outputs={draft}
        onChange={setDraft}
        hint={<>把响应里的字段存为变量；后续编排链 import 这条请求时会一起拷过去</>}
        responseBody={saved.lastResponseBody}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>取消</Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          保存输出
        </Button>
      </div>
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
  session, initial, onRequestChange, onResponseChange,
}: {
  session: SessionView
  initial: SavedRequestView | null
  /** 编辑器内容变化时回调，父组件用于「批量执行」面板拿当前模板。 */
  onRequestChange?: (req: ExecuteRequestBody) => void
  /** 响应到达 / 清空时回调，给「批量执行」面板拿 "最近响应" 作循环源。 */
  onResponseChange?: (body: string | null) => void
}) {
  const qc = useQueryClient()
  const promptInput = usePrompt()
  const [mode, setMode] = useState<'curl' | 'raw'>('curl')
  const [curl, setCurl] = useState('')
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('Accept: application/json')
  const [body, setBody] = useState('')
  const [resp, setResp] = useState<ExecutedResponse | null>(null)
  // 当前编辑器内容对应的已保存条目，用于「另存为新条目」时给出默认名字。
  const [loadedFrom, setLoadedFrom] = useState<SavedRequestView | null>(null)

  // 把当前编辑器内容/响应实时同步给父组件，便于批量执行面板复用
  useEffect(() => {
    if (!onRequestChange) return
    onRequestChange(
      mode === 'curl'
        ? { curl }
        : { method, url, headers: parseHeaders(headersText), body: body || undefined },
    )
  }, [mode, curl, method, url, headersText, body, onRequestChange])

  useEffect(() => {
    onResponseChange?.(resp?.body ?? null)
  }, [resp, onResponseChange])

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
    mutationFn: async () => {
      const defaultName = mode === 'curl'
        ? (curl.split(/\s+/).find(s => s.startsWith('http')) ?? 'cURL 请求')
        : `${method} ${url}`
      const name = await promptInput({
        title: '保存请求',
        description: '给这条请求起个好认的名字，下次点收藏列表就能一键载入。',
        placeholder: defaultName,
        defaultValue: loadedFrom?.name ?? defaultName,
        confirmText: '保存',
        validate: v => v.length === 0 ? '名字不能为空' : v.length > 80 ? '名字过长（≤ 80 字符）' : null,
      })
      if (name == null) throw new Error('__cancelled__')
      // 把当前响应一并送给后端作为「上次响应」样本，便于编排时配 outputs 参考
      const lastResponseBody = resp?.body || undefined
      const payload = mode === 'curl'
        ? { name, curl, lastResponseBody }
        : { name, method, url, headers: parseHeaders(headersText), body: body || undefined, lastResponseBody }
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

      {resp && (
        <ResponseView
          resp={resp}
          sessionId={session.id}
          loadedFromSavedId={loadedFrom?.id ?? null}
          onStripConditionalHeaders={() => {
            if (mode === 'curl') {
              const next = stripConditionalHeadersFromCurl(curl)
              if (next === curl) return
              setCurl(next)
              setTimeout(() => execMut.mutate(), 0)
            } else {
              const next = stripConditionalHeadersFromText(headersText)
              if (next === headersText) return
              setHeadersText(next)
              setTimeout(() => execMut.mutate(), 0)
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * 从 cURL 文本里删除条件请求头行。识别格式：
 *   -H 'If-None-Match: ...' \      (bash 风格，单/双引号)
 *   --header "If-Modified-Since: ..."
 *   -H If-None-Match:...           (不带引号也兼容)
 */
function stripConditionalHeadersFromCurl(curl: string): string {
  const targets = new Set(['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since', 'if-range'])
  // 兼容 windows ^ 续行 / posix \ 续行 —— 简化策略：按物理行切，不动续行符
  const lines = curl.split('\n')
  const kept = lines.filter(line => {
    const m = line.match(/^\s*(?:-H|--header)\s+['"]?\s*([^:\s'"]+)\s*:/i)
    if (!m) return true
    return !targets.has(m[1].toLowerCase())
  })
  return kept.join('\n')
}

/** 从「结构化」模式的 headers 文本框删除条件请求头。 */
function stripConditionalHeadersFromText(text: string): string {
  const targets = new Set(['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since', 'if-range'])
  return text.split('\n').filter(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return true
    const idx = trimmed.indexOf(':')
    if (idx <= 0) return true
    return !targets.has(trimmed.slice(0, idx).trim().toLowerCase())
  }).join('\n')
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

/** 字号对齐项目其他 pre 块的 12px。 */
const cmFontTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
})

function ResponseView({
  resp, sessionId, loadedFromSavedId, onStripConditionalHeaders,
}: {
  resp: ExecutedResponse
  sessionId: string
  /** 当前编辑器关联的已保存请求 id，用于「提取为变量」弹窗默认目标 */
  loadedFromSavedId: string | null
  /** 点击「移除条件头并重发」时的回调（由 RequestExecutor 注入）。 */
  onStripConditionalHeaders?: () => void
}) {
  const [extractOpen, setExtractOpen] = useState(false)
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

  const locationHeader = headerLookup['location']
  const is304 = resp.status === 304
  const isRedirect = resp.status >= 300 && resp.status < 400 && !is304
  const wasFollowed = resp.finalUrl && resp.finalUrl !== headerLookup['__request_url__']

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
          <Button size="sm" variant="ghost" onClick={() => setExtractOpen(true)}
                  title="从响应里提取字段存到变量池">
            <Variable />
          </Button>
          <Button size="sm" variant="ghost" onClick={copy} title="复制完整响应体">
            <Copy />
          </Button>
          <Button size="sm" variant="ghost" onClick={download} title="下载完整响应体">
            <Download />
          </Button>
        </div>
      </div>

      {extractOpen && (
        <ExtractVarDialog
          sessionId={sessionId}
          body={resp.body}
          loadedFromSavedId={loadedFromSavedId}
          onClose={() => setExtractOpen(false)}
        />
      )}

      {is304 && (
        <div className="space-y-2 rounded border border-blue-500/40 bg-blue-500/10 p-2 text-xs">
          <div>
            <strong>304 Not Modified</strong>：服务端判定资源未变化，按 HTTP 协议响应体为空。
            常见原因——请求头里带了 <code>If-None-Match</code> / <code>If-Modified-Since</code> 等条件头。
          </div>
          {onStripConditionalHeaders && (
            <Button size="sm" variant="outline" onClick={onStripConditionalHeaders}>
              <Play />
              移除条件头并重发
            </Button>
          )}
        </div>
      )}
      {isRedirect && (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
          <strong>{resp.status} 重定向</strong>：服务端要把你导向{locationHeader
            ? <> <code className="break-all">{locationHeader}</code></>
            : ' 其他地址'}。
          {wasFollowed ? '本工具已自动跟随到最终地址（见下方）。' : '未自动跟随——可能 Location 缺失或为不安全协议。'}
        </div>
      )}
      {resp.finalUrl && (
        <div className="break-all text-xs text-[var(--color-muted-foreground)]">
          → 最终响应来自：<span className="font-mono">{resp.finalUrl}</span>
        </div>
      )}
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

// ── 提取为变量的 Dialog（绑到 SavedRequest）──────────────────────────────────

function ExtractVarDialog({
  sessionId, body, loadedFromSavedId, onClose,
}: {
  sessionId: string
  body: string
  /** 当前 RequestExecutor 关联的已保存请求 id（用户最近 load 那条），作为默认目标 saved */
  loadedFromSavedId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: savedList = [] } = useQuery({
    queryKey: SAVED_KEY(sessionId),
    queryFn: () => listSavedRequests(sessionId),
  })

  const [targetSavedId, setTargetSavedId] = useState<string>(loadedFromSavedId ?? '')
  const [path, setPath] = useState('$')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // savedList 加载完成后如果还没选目标 + 有默认值，就用默认
  useEffect(() => {
    if (!targetSavedId && loadedFromSavedId) setTargetSavedId(loadedFromSavedId)
  }, [loadedFromSavedId, targetSavedId])

  const parsed = useMemo<{ ok: true; data: unknown } | { ok: false; err: string }>(() => {
    try { return { ok: true, data: JSON.parse(body) } }
    catch (e) { return { ok: false, err: (e as Error).message } }
  }, [body])

  const previewValue = useMemo(() => {
    if (!parsed.ok) return undefined
    return evalJsonPath(parsed.data, path)
  }, [parsed, path])

  const previewStr = stringifyForVar(previewValue)

  /**
   * 下一级可达路径建议：当前 path 求值结果是对象时列出子键，是数组时列出前若干索引。
   * 不递归——递归会让列表炸开，用户点一下进一层即可。
   */
  const suggestions = useMemo<Array<{ path: string; preview: string; isLeaf: boolean }>>(() => {
    if (previewValue == null || typeof previewValue !== 'object') return []
    const trimmed = path.trim()
    const base = trimmed === '' ? '$' : trimmed
    if (Array.isArray(previewValue)) {
      const cap = Math.min(previewValue.length, 20)
      const out: Array<{ path: string; preview: string; isLeaf: boolean }> = []
      for (let i = 0; i < cap; i++) {
        const v = previewValue[i]
        out.push({
          path: `${base}[${i}]`,
          preview: stringifyForVar(v).slice(0, 80),
          isLeaf: v == null || typeof v !== 'object',
        })
      }
      return out
    }
    return Object.entries(previewValue).slice(0, 50).map(([k, v]) => ({
      path: VAR_NAME_RE.test(k) ? `${base}.${k}` : `${base}["${k.replace(/"/g, '\\"')}"]`,
      preview: stringifyForVar(v).slice(0, 80),
      isLeaf: v == null || typeof v !== 'object',
    }))
  }, [previewValue, path])

  /**
   * 自动从最后一个 path 段截一个 fallback 变量名（用户没填时方便）。
   * 例如 path=$.data.token → 'token'；$.data[0].id → 'id'
   */
  const suggestedName = useMemo(() => {
    const m = path.match(/[.[]([A-Za-z_][A-Za-z0-9_]*)\]?$/)
    return m ? m[1] : ''
  }, [path])

  const saveMut = useMutation({
    mutationFn: () => extractToSaved(targetSavedId, {
      name, jsonPath: path, responseBody: body,
    }),
    onSuccess: () => {
      // saved 数据变了——刷新已保存请求列表
      qc.invalidateQueries({ queryKey: SAVED_KEY(sessionId) })
      onClose()
    },
    onError: e => setError((e as Error).message),
  })

  const submit = () => {
    if (!targetSavedId) {
      setError('请先选择「目标已保存请求」——变量必须归属某条 saved'); return
    }
    if (!VAR_NAME_RE.test(name)) {
      setError('变量名只能含字母 / 数字 / 下划线，且不能以数字开头'); return
    }
    if (previewValue === undefined) {
      setError('JSONPath 求值结果为空（路径不存在）'); return
    }
    setError(null)
    saveMut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}>
      <div className="w-[min(92vw,560px)] space-y-3 rounded-lg border bg-[var(--color-card)] p-5 shadow-lg"
           onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <div className="text-base font-semibold">从响应中提取为输出</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            变量必须归属某条已保存请求；保存后该 saved 的 outputs 配置 + 提取的值都会更新，
            编排里写 <code>{'{{name}}'}</code> 即可引用。
          </div>
        </div>

        {!parsed.ok && (
          <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
            响应不是合法 JSON：{parsed.err}。只能从 JSON 响应提取。
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium">目标已保存请求 *</label>
          {savedList.length === 0 ? (
            <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
              当前会话没有已保存请求。请先在响应区点「保存」收藏当前请求，再来提取。
            </div>
          ) : (
            <select
              className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
              value={targetSavedId}
              onChange={e => setTargetSavedId(e.target.value)}
            >
              <option value="">— 选择目标请求 —</option>
              {savedList.map(s => {
                const oc = s.outputs?.length ?? 0
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{oc > 0 ? ` (已配 ${oc} 个输出)` : ''}
                  </option>
                )
              })}
            </select>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">JSONPath</label>
          <Input
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="$.data.token"
            disabled={!parsed.ok}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className="rounded border bg-[var(--color-muted)]/40 p-1.5">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                下一级（点击补全）
              </div>
              <div className="max-h-48 overflow-auto">
                {suggestions.map(s => (
                  <button
                    key={s.path}
                    type="button"
                    onClick={() => setPath(s.path)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--color-accent)]"
                  >
                    <code className="shrink-0 font-mono text-xs">{s.path.slice(path.trim().length || 1)}</code>
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">
                      {s.preview}
                    </span>
                    {s.isLeaf && (
                      <Badge variant="outline" className="shrink-0">叶子</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">当前求值结果</label>
          <pre className="max-h-32 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs">
{previewValue === undefined
  ? '(undefined — 路径不存在或响应非 JSON)'
  : previewStr || '(空字符串)'}
          </pre>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">变量名</label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder={suggestedName ? `例如 ${suggestedName}` : '例如 token'}
            />
            {suggestedName && !name && (
              <Button size="sm" variant="outline" onClick={() => setName(suggestedName)}
                      title="用 JSONPath 末尾字段作变量名">
                用「{suggestedName}」
              </Button>
            )}
          </div>
          {error && <div className="text-xs text-[var(--color-destructive)]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={submit}
                  disabled={!parsed.ok || saveMut.isPending || previewValue === undefined || !name || !targetSavedId}>
            {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            保存到目标请求
          </Button>
        </div>
      </div>
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

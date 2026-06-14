import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, GitCommit, List, Maximize2, Minimize2, MoreHorizontal, Package, Paperclip, PictureInPicture2, Plus, RotateCw, Send, ShieldCheck, Slash, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'
import { MessageList } from '../components/MessageList'
import { PermissionDialog } from '../components/PermissionDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { SessionList } from '../components/SessionList'
import { HistoryList } from '../components/HistoryList'
import { NotifySettings } from '../components/NotifySettings'
import { VoiceInputButton } from '../components/VoiceInputButton'
import { AttachmentChips } from '../components/AttachmentChips'
import { ModeSwitch } from '../components/ModeSwitch'
import { SlashCommandMenu } from '../components/SlashCommandMenu'
import { CommandMenu } from '../components/CommandMenu'
import { PluginPanel } from '../components/PluginPanel'
import { getSessionCommitDiff, listSessionCommits, listSessions, listWorkspaces, uploadAttachment, type UploadedAttachment } from '../api'
import { CommitsPanel } from '@/components/git/CommitsPanel'
import type { Engine } from '../types'
import { ensureNotifyPermission } from '../browserNotify'

type Panel = 'none' | 'sessions' | 'settings' | 'new' | 'plugins'

/** 单条消息最多附件数，与后端约定一致。 */
const MAX_ATTACHMENTS = 10

/** 附件 + 本地 blob 预览地址（图片粘贴后点击放大核对，无需后端回读端点）。 */
type ChatAttachment = UploadedAttachment & { previewUrl?: string }

/** 引擎显示名。 */
function engineName(e: Engine): string {
  return e === 'codex' ? 'Codex' : e === 'gemini' ? 'Gemini' : 'Claude'
}

/** 顶栏「更多」菜单的一项：图标 + 中文标签（+ 可选副提示），让功能一目了然。 */
function HeaderMenuItem({ icon, label, hint, onClick }: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)]"
    >
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}
      </span>
    </button>
  )
}

export function ChatPage() {
  const { chat, setFloating, setMinimized, getReturnRoute } = useChatRuntime()
  const navigate = useNavigate()
  const pending = chat?.pending ?? null

  // 一键重启后端：调守护进程(run-supervised.ps1)的独立控制口 /supervisor/restart(经 Vite 代理到 :18081)。
  // 与后端独立——后端宕机时本控制口仍在,故能拉起。当前 WS 会断,重启后前端自动重连续上。
  // token 用应用内输入框收，不用 window.prompt：移动端浏览器/WebView 普遍禁用 prompt（静默返回 null），
  // 会导致“点了没反应、不弹输入框”。confirm/alert 同理改为应用内弹层 + 行内状态。
  const [showCommits, setShowCommits] = useState(false)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [restartToken, setRestartToken] = useState('')
  const [restartStatus, setRestartStatus] = useState('')
  const [restartBusy, setRestartBusy] = useState(false)

  const openRestart = () => {
    setRestartToken(localStorage.getItem('kai-toolbox:supervisor-token') ?? '')
    setRestartStatus('')
    setRestartOpen(true)
  }

  const doRestart = async () => {
    const token = restartToken.trim()
    if (!token) { setRestartStatus('请先输入 RestartToken'); return }
    localStorage.setItem('kai-toolbox:supervisor-token', token)
    setRestartBusy(true)
    setRestartStatus('正在请求重启…')
    try {
      const r = await fetch('/supervisor/restart', { method: 'POST', headers: { 'X-Restart-Token': token } })
      if (r.ok) setRestartStatus('✅ 重启已触发，后端数秒后回来，页面会自动重连。')
      else if (r.status === 403) { localStorage.removeItem('kai-toolbox:supervisor-token'); setRestartStatus('❌ token 不匹配（已清除，请重新输入）') }
      else if (r.status === 503) setRestartStatus('❌ 守护进程未配置 RestartToken（改 run-supervised.ps1 的 $RestartToken）')
      else if (r.status === 404) setRestartStatus('❌ /supervisor 未代理到 :18081 —— 重启一次 npm run dev 让 vite 代理生效')
      else setRestartStatus(`❌ 重启请求失败：HTTP ${r.status}`)
    } catch {
      setRestartStatus('❌ 连不上守护口(:18081)，确认后端是用 run-supervised.ps1 启动的')
    } finally {
      setRestartBusy(false)
    }
  }

  // 全自动·弹窗自动允许（前端兜底）：bypassPermissions 下仍偶有工具弹 allow/deny 框，
  // 开此开关后收到权限框就自动 decide(allow)。仅对 permission 生效，question（AskUserQuestion）不自动应答。
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem('kai-toolbox:auto-approve-permission') === '1')
  const autoApprovedRef = useRef<string | null>(null)
  const toggleAutoApprove = () => {
    setAutoApprove(v => {
      const nv = !v
      localStorage.setItem('kai-toolbox:auto-approve-permission', nv ? '1' : '0')
      return nv
    })
  }
  useEffect(() => {
    if (!chat || chat.mode !== 'bypassPermissions' || !autoApprove) return
    if (pending?.kind !== 'permission') return
    if (autoApprovedRef.current === pending.reqId) return // 同一请求只自动放行一次
    autoApprovedRef.current = pending.reqId
    chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })
  }, [pending, autoApprove, chat])

  // 弹出悬浮窗：开启浮窗并离开会话页（浮窗与全屏页互斥渲染）。回到进入会话页前最后访问的页面，而非每次回首页。
  const popOutFloating = () => {
    setFloating(true)
    setMinimized(false)
    navigate(getReturnRoute())
  }
  const [panel, setPanel] = useState<Panel>('none')
  const [sessTab, setSessTab] = useState<'tool' | 'history'>('tool')
  const [draft, setDraft] = useState('')
  const [newCwd, setNewCwd] = useState('')
  const [newEngine, setNewEngine] = useState<Engine>('claude')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [slashIdx, setSlashIdx] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [cmdMenuOpen, setCmdMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 全屏时按 Esc 退出
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // 自动续接最近会话已上提到 ChatRuntime 引擎（跨路由常驻），此处不再处理。

  // 新建面板展开时才扫描工作目录；接口失败/为空则下拉为空，输入框仍可手填（降级不阻断）
  const { data: workspaces } = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    enabled: panel === 'new',
    staleTime: 5000,
  })
  const wsDirs = workspaces?.roots.flatMap(r => r.dirs) ?? []

  // 顶栏标题显示当前会话别名（与会话列表共用同一 query 缓存）；无别名/无会话时回退 Vibe Coding
  const { data: sessions = [] } = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    staleTime: 5000,
  })
  const currentTitle = sessions.find(s => s.id === chat?.sessionId)?.title?.trim()

  // 引擎激活前一帧 chat 可能为空（懒启动）：占位，下一帧即就绪
  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        正在启动 Vibe Coding…
      </div>
    )
  }

  const startNew = () => {
    chat.open(newCwd.trim(), undefined, undefined, newEngine)
    setPanel('none')
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || !chat.sessionId) return
    const room = MAX_ATTACHMENTS - attachments.length - uploading
    const take = Array.from(files).slice(0, Math.max(0, room))
    const sid = chat.sessionId
    for (const f of take) {
      setUploading(n => n + 1)
      try {
        const att = await uploadAttachment(sid, f)
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAttachments(prev => [...prev, { ...att, previewUrl }])
      } catch (e) {
        console.error('[claude-chat] 附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  // 粘贴：剪贴板含文件（如截图）则当附件上传，纯文本照常粘贴
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }

  const submit = () => {
    if (!chat.sessionId) return
    if (!draft.trim() && attachments.length === 0) return
    ensureNotifyPermission() // 借发送这个手势兜底申请一次通知权限

    chat.send(draft, attachments.map(a => ({ name: a.name, path: a.path })))
    attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setDraft('')
    setAttachments([])
  }

  // slash 命令补全：输入框行首为 "/<前缀>"（无空格）时按前缀过滤可用命令
  const slashMatch = /^\/(\S*)$/.exec(draft)
  const slashFiltered = slashMatch
    ? chat.slashCommands.filter(c => c.toLowerCase().startsWith(slashMatch[1].toLowerCase()))
    : []
  const showSlash = !slashDismissed && slashMatch != null && slashFiltered.length > 0
  const slashActive = showSlash ? Math.min(slashIdx, slashFiltered.length - 1) : 0
  const pickSlash = (cmd: string) => {
    setDraft('/' + cmd + ' ') // 带空格便于接参数；含空格后正则不再匹配，浮层自动收起
    setSlashDismissed(true)
    setSlashIdx(0)
  }

  return (
    <div className={fullscreen
      ? 'fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[var(--color-muted)]/40'
      : 'flex h-[calc(100dvh-3.5rem)] flex-col bg-[var(--color-muted)]/40'}>
      {/* 顶栏：主色渐变（彩色），与中部灰画布、底部白输入条三段分明，随主题主色变化 */}
      <header className="flex items-center gap-2 border-b-2 border-[var(--color-primary)]/40 bg-gradient-to-r from-[var(--color-primary)]/20 to-[var(--color-primary)]/6 px-3 py-2 shadow-sm">
        <span className="max-w-[40vw] truncate font-semibold text-[var(--color-primary)]" title={currentTitle || 'Vibe Coding'}>{currentTitle || 'Vibe Coding'}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${chat.currentEngine === 'codex'
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200'
          : 'border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}>
          {engineName(chat.currentEngine)}
        </span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{stateLabel(chat.state)}</span>
        <div className="ml-auto flex items-center gap-1">
          {/* 常用：带文字标签，一眼可辨 */}
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setPanel(p => p === 'new' ? 'none' : 'new')} aria-label="新建会话">
            <Plus className="size-4" /> 新建
          </Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setPanel(p => p === 'sessions' ? 'none' : 'sessions')} aria-label="会话列表">
            <List className="size-4" /> 会话
          </Button>
          {/* 其余功能收进「更多」菜单，每项带中文标签，避免一排没标识的图标 */}
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setHeaderMenu(o => !o)} aria-label="更多功能" title="更多功能">
              <MoreHorizontal className="size-5" />
            </Button>
            {headerMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border bg-[var(--color-popover)] py-1 text-[var(--color-popover-foreground)] shadow-xl">
                  <HeaderMenuItem icon={<PictureInPicture2 className="size-4" />} label="弹出悬浮窗" hint="切到其他模块常驻显示" onClick={() => { setHeaderMenu(false); popOutFloating() }} />
                  <HeaderMenuItem icon={fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} label={fullscreen ? '退出全屏' : '全屏显示'} onClick={() => { setHeaderMenu(false); setFullscreen(f => !f) }} />
                  {chat.sessionId && (
                    <HeaderMenuItem icon={<GitCommit className="size-4" />} label="提交记录" hint="当前目录 git 提交/diff" onClick={() => { setHeaderMenu(false); setShowCommits(true) }} />
                  )}
                  <HeaderMenuItem icon={<Package className="size-4" />} label="插件更新" hint="查看/更新双端插件" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'plugins' ? 'none' : 'plugins') }} />
                  <HeaderMenuItem icon={<Bell className="size-4" />} label="通知设置" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'settings' ? 'none' : 'settings') }} />
                  <HeaderMenuItem icon={<RotateCw className="size-4" />} label="重启服务" hint="经守护进程重启后端" onClick={() => { setHeaderMenu(false); openRestart() }} />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 折叠面板 */}
      {panel === 'new' && (
        <div className="border-b px-3 py-3">
          <label className="text-xs text-[var(--color-muted-foreground)]">工作目录（cwd，留空用 home）</label>
          <div className="mt-1 flex gap-2">
            <input
              list="claude-chat-cwd-dirs"
              className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder={wsDirs.length ? '选择或输入工作目录…' : '例如 D:/Users/zhang/IdeaProjects/kai-toolbox'}
              value={newCwd}
              onChange={e => setNewCwd(e.target.value)}
            />
            <datalist id="claude-chat-cwd-dirs">
              {wsDirs.map(d => (
                <option key={d.path} value={d.path}>{d.name}</option>
              ))}
            </datalist>
            <Button size="lg" className="shadow-md" onClick={startNew}>开始</Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">引擎</span>
            {(['claude', 'codex', 'gemini'] as Engine[]).map(eng => (
              <button
                key={eng}
                type="button"
                onClick={() => setNewEngine(eng)}
                className={`rounded-full border px-3 py-1 text-xs ${newEngine === eng
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
              >
                {engineName(eng)}
              </button>
            ))}
            {newEngine === 'codex' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">（Codex 靠沙箱，不弹权限框）</span>
            )}
            {newEngine === 'gemini' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">（Gemini CLI headless，需本机已登录 gemini 或配置 GEMINI_API_KEY）</span>
            )}
          </div>
        </div>
      )}
      {panel === 'sessions' && (
        <div className="flex max-h-[55vh] flex-col border-b">
          <div className="flex gap-1 px-3 pt-2">
            <TabBtn active={sessTab === 'tool'} onClick={() => setSessTab('tool')}>工具会话</TabBtn>
            <TabBtn active={sessTab === 'history'} onClick={() => setSessTab('history')}>本机历史</TabBtn>
          </div>
          <div className="overflow-y-auto">
            {sessTab === 'tool' ? (
              <SessionList currentSessionId={chat.sessionId} onSwitch={id => { chat.switchTo(id); setPanel('none') }} />
            ) : (
              <HistoryList
                defaultCwd={newCwd}
                onPick={(sid, cwd) => { chat.resumeHistory(sid, cwd); setPanel('none') }}
              />
            )}
          </div>
        </div>
      )}
      {panel === 'settings' && (
        <div className="max-h-[60vh] overflow-y-auto border-b">
          <NotifySettings onClose={() => setPanel('none')} />
        </div>
      )}
      {panel === 'plugins' && (
        <div className="max-h-[60vh] overflow-y-auto">
          <PluginPanel onClose={() => setPanel('none')} />
        </div>
      )}

      {/* 会话目录 git 提交记录（复用通用 CommitsPanel，按 sessionId 服务端解析 cwd） */}
      {showCommits && chat.sessionId && (
        <CommitsPanel
          title="会话目录"
          fetchCommits={() => listSessionCommits(chat.sessionId!, 50).then(r => r.commits)}
          fetchDiff={hash => getSessionCommitDiff(chat.sessionId!, hash)}
          onClose={() => setShowCommits(false)}
        />
      )}

      {/* 一键重启：应用内弹层（移动端 window.prompt 不可用，必须用页面内输入框收 token） */}
      {restartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!restartBusy) setRestartOpen(false) }}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-[var(--color-background)] p-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium">重启后端服务</h3>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              当前连接会短暂断开，重启后页面自动重连续上会话。输入守护进程 RestartToken（run-supervised.ps1 里的 $RestartToken）。
            </p>
            <Input
              type="password"
              autoFocus
              className="mt-3"
              placeholder="RestartToken"
              value={restartToken}
              onChange={e => setRestartToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !restartBusy) doRestart() }}
            />
            {restartStatus && <p className="mt-2 text-xs">{restartStatus}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={restartBusy} onClick={() => setRestartOpen(false)}>取消</Button>
              <Button size="sm" disabled={restartBusy} onClick={doRestart}>{restartBusy ? '请求中…' : '重启'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* 同步空洞提示：断线较久时部分消息已被服务端缓冲淘汰，回放补不回 */}
      {chat.syncWarning && (
        <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <span className="flex-1">{chat.syncWarning}</span>
          <button
            type="button"
            onClick={chat.dismissSyncWarning}
            aria-label="关闭提示"
            className="shrink-0 rounded px-1.5 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
          >
            知道了
          </button>
        </div>
      )}

      {/* 消息流 */}
      {chat.sessionId ? (
        <MessageList
          items={chat.items}
          running={chat.running}
          onLoadEarlier={() => chat.loadHistory(false)}
          loadingEarlier={chat.historyLoading}
          exhausted={chat.historyExhausted}
          onFork={chat.forkSession}
          engineLabel={engineName(chat.currentEngine)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--color-muted-foreground)]">
          <p>选一个历史会话，或新建一个开始对话</p>
          <Button size="lg" className="shadow-md" onClick={() => setPanel('new')}>
            <Plus className="size-4" /> 新建会话
          </Button>
        </div>
      )}

      {/* 底部输入：白色悬浮输入条 + 主色上边框 + 顶部阴影，在灰画布上明显托起 */}
      {chat.sessionId && (
        <div className="border-t-2 border-[var(--color-primary)]/35 bg-gradient-to-r from-[var(--color-primary)]/20 to-[var(--color-primary)]/6 shadow-[0_-3px_12px_-4px_rgba(0,0,0,0.14)]">
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(prev => {
              const t = prev.find(a => a.id === id)
              if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
              return prev.filter(a => a.id !== id)
            })}
          />
          <div className="flex items-center gap-2 px-3 pt-2">
            <ModeSwitch mode={chat.mode} onChange={chat.setMode} />
            {chat.mode === 'bypassPermissions' && (
              <button
                type="button"
                onClick={toggleAutoApprove}
                title="全自动下：弹出的权限框自动点「允许」（仅权限框；AskUserQuestion 提问不自动应答）"
                aria-label="弹窗自动允许开关"
                className={'flex items-center gap-1 rounded-md border px-2 py-1 text-xs '
                  + (autoApprove
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'text-[var(--color-muted-foreground)]')}
              >
                <ShieldCheck className="size-3.5" /> 弹窗自动允许·{autoApprove ? '开' : '关'}
              </button>
            )}
          </div>
          {showSlash && (
            <SlashCommandMenu commands={slashFiltered} activeIndex={slashActive} onPick={pickSlash} />
          )}
          <div className="flex items-end gap-2 px-3 py-2">
            {/* 用 <label> 包住 input：点 label 由浏览器原生触发文件选择，绕开「移动端 WebView 里
                JS input.click() 丢用户手势、选择器弹不出」的坑（sr-only/.click() 方案在部分机型仍失败）。
                Button asChild 把按钮样式套到 label 上，外观不变。 */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-disabled={attachments.length + uploading >= MAX_ATTACHMENTS}
            >
              <label
                aria-label="添加附件"
                title="添加图片 / 文档"
                className={`cursor-pointer${attachments.length + uploading >= MAX_ATTACHMENTS ? ' pointer-events-none opacity-50' : ''}`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="sr-only"
                  disabled={attachments.length + uploading >= MAX_ATTACHMENTS}
                  onChange={e => handleFiles(e.target.files)}
                />
                <Paperclip className="size-5" />
              </label>
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCmdMenuOpen(o => !o)}
                aria-label="斜杠命令"
                title="斜杠命令"
              >
                <Slash className="size-5" />
              </Button>
              {cmdMenuOpen && (
                <CommandMenu
                  commands={chat.slashCommands}
                  models={chat.models}
                  currentModel={chat.currentModel}
                  engine={chat.currentEngine}
                  onClose={() => setCmdMenuOpen(false)}
                  onPickCommand={cmd => { setDraft('/' + cmd + ' '); setCmdMenuOpen(false) }}
                  onPickModel={value => { chat.setModel(value); setCmdMenuOpen(false) }}
                />
              )}
            </div>
            <VoiceInputButton
              disabled={chat.running}
              onText={t => setDraft(d => d.trim() ? `${d} ${t}` : t)}
            />
            <textarea
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder={`给 ${engineName(chat.currentEngine)} 下发任务…（Enter 换行，Shift+Enter 发送）`}
              rows={1}
              value={draft}
              onChange={e => { setDraft(e.target.value); setSlashDismissed(false); setSlashIdx(0) }}
              onPaste={handlePaste}
              onKeyDown={e => {
                // Shift+Enter 发送（Enter 仍为换行）；优先于 slash 菜单的 Enter 选中
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault()
                  if (!chat.running) submit()
                  return
                }
                if (!showSlash) return
                if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % slashFiltered.length) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + slashFiltered.length) % slashFiltered.length) }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(slashFiltered[slashActive]) }
                else if (e.key === 'Escape') { e.preventDefault(); setSlashDismissed(true) }
              }}
            />
            {chat.running ? (
              <Button variant="outline" size="lg" onClick={chat.interrupt} aria-label="中断">
                <Square className="size-4" /> 中断
              </Button>
            ) : (
              <Button
                size="lg"
                className="shadow-md"
                onClick={submit}
                disabled={!draft.trim() && attachments.length === 0}
                aria-label="发送"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 可视化决策弹窗：先取出 const 让收窄在闭包里保留 */}
      {pending?.kind === 'permission' && (
        <PermissionDialog
          toolName={pending.toolName}
          input={pending.input}
          onAllow={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
          onDeny={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
        />
      )}
      {pending?.kind === 'question' && (
        <QuestionDialog
          questions={pending.questions}
          onCancel={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
          onSubmit={answers => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })}
        />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-t-md px-3 py-1.5 text-sm ' +
        (active ? 'border-b-2 border-[var(--color-primary)] font-medium' : 'text-[var(--color-muted-foreground)]')
      }
    >
      {children}
    </button>
  )
}

function stateLabel(s: string): string {
  switch (s) {
    case 'connecting': return '连接中…'
    case 'ready': return '已连接'
    case 'closed': return '已断开（重连中）'
    case 'error': return '连接出错'
    default: return ''
  }
}

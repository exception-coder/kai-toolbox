import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, List, Maximize2, Minimize2, Paperclip, PictureInPicture2, Plus, Send, Slash, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { listWorkspaces, uploadAttachment, type UploadedAttachment } from '../api'
import { ensureNotifyPermission } from '../browserNotify'

type Panel = 'none' | 'sessions' | 'settings' | 'new'

/** 单条消息最多附件数，与后端约定一致。 */
const MAX_ATTACHMENTS = 10

/** 附件 + 本地 blob 预览地址（图片粘贴后点击放大核对，无需后端回读端点）。 */
type ChatAttachment = UploadedAttachment & { previewUrl?: string }

export function ChatPage() {
  const { chat, setFloating } = useChatRuntime()
  const pending = chat?.pending ?? null
  const [panel, setPanel] = useState<Panel>('none')
  const [sessTab, setSessTab] = useState<'tool' | 'history'>('tool')
  const [draft, setDraft] = useState('')
  const [newCwd, setNewCwd] = useState('')
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

  // 引擎激活前一帧 chat 可能为空（懒启动）：占位，下一帧即就绪
  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        正在启动 Vibe Coding…
      </div>
    )
  }

  const startNew = () => {
    chat.open(newCwd.trim())
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
      ? 'fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[var(--color-background)]'
      : 'flex h-[calc(100dvh-3.5rem)] flex-col'}>
      {/* 顶栏 */}
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="font-semibold">Vibe Coding</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{stateLabel(chat.state)}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => setFloating(true)} aria-label="弹出为悬浮窗" title="弹出为悬浮窗（切到其他模块时常驻显示，对话不断）">
            <PictureInPicture2 className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setFullscreen(f => !f)} aria-label={fullscreen ? '退出全屏' : '全屏显示'} title={fullscreen ? '退出全屏（Esc）' : '全屏显示对话框'}>
            {fullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPanel(p => p === 'new' ? 'none' : 'new')} aria-label="新建会话">
            <Plus className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPanel(p => p === 'sessions' ? 'none' : 'sessions')} aria-label="会话列表">
            <List className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')} aria-label="通知设置">
            <Bell className="size-5" />
          </Button>
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
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--color-muted-foreground)]">
          <p>选一个历史会话，或新建一个开始对话</p>
          <Button size="lg" className="shadow-md" onClick={() => setPanel('new')}>
            <Plus className="size-4" /> 新建会话
          </Button>
        </div>
      )}

      {/* 底部输入 */}
      {chat.sessionId && (
        <div className="border-t">
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(prev => {
              const t = prev.find(a => a.id === id)
              if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
              return prev.filter(a => a.id !== id)
            })}
          />
          <div className="flex items-center px-3 pt-2">
            <ModeSwitch mode={chat.mode} onChange={chat.setMode} />
          </div>
          {showSlash && (
            <SlashCommandMenu commands={slashFiltered} activeIndex={slashActive} onPick={pickSlash} />
          )}
          <div className="flex items-end gap-2 px-3 py-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length + uploading >= MAX_ATTACHMENTS}
              aria-label="添加附件"
              title="添加图片 / 文档"
            >
              <Paperclip className="size-5" />
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
              placeholder="给 Claude 下发任务…（Enter 换行，Shift+Enter 发送）"
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

import { useRef, useState } from 'react'
import { Bell, List, Paperclip, Plus, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { MessageList } from '../components/MessageList'
import { PermissionDialog } from '../components/PermissionDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { SessionList } from '../components/SessionList'
import { HistoryList } from '../components/HistoryList'
import { NotifySettings } from '../components/NotifySettings'
import { VoiceInputButton } from '../components/VoiceInputButton'
import { AttachmentChips } from '../components/AttachmentChips'
import { uploadAttachment, type UploadedAttachment } from '../api'

type Panel = 'none' | 'sessions' | 'settings' | 'new'

/** 单条消息最多附件数，与后端约定一致。 */
const MAX_ATTACHMENTS = 10

export function ChatPage() {
  const chat = useClaudeChatSocket()
  const pending = chat.pending
  const [panel, setPanel] = useState<Panel>('none')
  const [sessTab, setSessTab] = useState<'tool' | 'history'>('tool')
  const [draft, setDraft] = useState('')
  const [newCwd, setNewCwd] = useState('')
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

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
        setAttachments(prev => [...prev, att])
      } catch (e) {
        console.error('[claude-chat] 附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = () => {
    if (!chat.sessionId) return
    if (!draft.trim() && attachments.length === 0) return
    chat.send(draft, attachments.map(a => ({ name: a.name, path: a.path })))
    setDraft('')
    setAttachments([])
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* 顶栏 */}
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="font-semibold">Claude 助手</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{stateLabel(chat.state)}</span>
        <div className="ml-auto flex gap-1">
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
              className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="例如 D:/Users/zhang/IdeaProjects/kai-toolbox"
              value={newCwd}
              onChange={e => setNewCwd(e.target.value)}
            />
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

      {/* 消息流 */}
      {chat.sessionId ? (
        <MessageList items={chat.items} running={chat.running} />
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
            onRemove={id => setAttachments(prev => prev.filter(a => a.id !== id))}
          />
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
            <VoiceInputButton
              disabled={chat.running}
              onText={t => setDraft(d => d.trim() ? `${d} ${t}` : t)}
            />
            <textarea
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="给 Claude 下发任务…"
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
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

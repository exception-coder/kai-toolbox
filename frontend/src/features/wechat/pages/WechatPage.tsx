import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Search, RotateCw, Send } from 'lucide-react'
import { http, subscribeSse, ApiError } from '@/lib/api'

// ── 高保真复刻微信：固定走微信自身配色，不跟随 toolbox 主题（这样才"像微信"）。
//    保持 layout:'tool'（登录鉴权）——这是私人聊天记录，绝不公开。

interface Health {
  lib?: string | null
  lib_version?: string | null
  wechat_online?: boolean
  nickname?: string | null
  listening?: string[]
  error?: string | null
}
interface ChatListItem {
  name: string
  lastSender: string
  lastContent: string
  lastType: string
  lastAt: number
}
interface ChatSummary { name: string; unread: number }
interface StoredMessage {
  id: number
  chat: string
  sender: string
  content: string
  type: string
  sentTime: string
  msgId: string
  createdAt: number
}
interface Row extends ChatListItem { unread: number }

const SYS_TYPES = new Set(['sys', 'system', 'time', 'tickle'])
const AVATAR_COLORS = ['#5B8FF9', '#61DDAA', '#F6BD16', '#7262FD', '#78D3F8', '#F08BB4', '#FF9D4D', '#69C0FF']

function avatar(name: string): { bg: string; ch: string } {
  const s = name || '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return { bg: AVATAR_COLORS[h % AVATAR_COLORS.length], ch: Array.from(s)[0] ?? '?' }
}

function listTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toTimeString().slice(0, 5)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
function msgTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return d.toTimeString().slice(0, 5)
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const a = avatar(name)
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[5px] font-medium text-white"
      style={{ width: size, height: size, background: a.bg, fontSize: size * 0.42 }}
    >
      {a.ch}
    </div>
  )
}

export function WechatPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected
  const scrollRef = useRef<HTMLDivElement>(null)

  const online = !!health?.wechat_online
  const nickname = health?.nickname ?? ''
  const listening = new Set(health?.listening ?? [])

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2500) }

  const loadHealth = useCallback(() => {
    http<Health>('/wechat/health').then(setHealth).catch(() => setHealth({ wechat_online: false }))
  }, [])

  const loadChats = useCallback(async () => {
    try {
      const dbChats = await http<ChatListItem[]>('/wechat/chats?limit=100')
      let unreadMap = new Map<string, number>()
      let sessionOnly: ChatListItem[] = []
      try {
        const sessions = await http<ChatSummary[]>('/wechat/sessions')
        unreadMap = new Map(sessions.map((s) => [s.name, s.unread]))
        const dbNames = new Set(dbChats.map((c) => c.name))
        sessionOnly = sessions
          .filter((s) => !dbNames.has(s.name))
          .map((s) => ({ name: s.name, lastSender: '', lastContent: '', lastType: '', lastAt: 0 }))
      } catch { /* sidecar 离线：只用库里的 */ }
      const merged: Row[] = [...dbChats, ...sessionOnly].map((c) => ({ ...c, unread: unreadMap.get(c.name) ?? 0 }))
      setRows(merged)
    } catch {
      setRows([])
    }
  }, [])

  const loadMessages = useCallback((chat: string) => {
    http<StoredMessage[]>(`/wechat/messages?chat=${encodeURIComponent(chat)}&limit=300`)
      .then(setMessages)
      .catch(() => setMessages([]))
  }, [])

  useEffect(() => {
    loadHealth()
    loadChats()
    const t = setInterval(loadHealth, 15000)
    return () => clearInterval(t)
  }, [loadHealth, loadChats])

  // 实时消息流（SSE，PC 推上来的新消息）
  useEffect(() => {
    const close = subscribeSse(
      '/wechat/stream',
      {
        onEvent: (name, data) => {
          if (name !== 'message') return
          const m = data as StoredMessage
          if (m.chat === selectedRef.current) setMessages((prev) => [...prev, m])
          loadChats()
        },
      },
      ['ready', 'message'],
    )
    return close
  }, [loadChats])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, view])

  const openChat = (chat: string) => {
    setSelected(chat)
    setMessages([])
    setView('chat')
    loadMessages(chat)
  }

  const refreshLive = async () => {
    if (!selected) return
    setRefreshing(true)
    try {
      await http('/wechat/listen', { method: 'POST', body: JSON.stringify({ who: selected }) })
      await http(`/wechat/messages/live?who=${encodeURIComponent(selected)}&count=50`)
      loadMessages(selected)
      loadHealth()
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '刷新失败，sidecar 可能未启动')
    } finally {
      setRefreshing(false)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (!selected || !text) return
    setSending(true)
    try {
      await http('/wechat/send', { method: 'POST', body: JSON.stringify({ who: selected, text }) })
      setDraft('')
      setMessages((prev) => [
        ...prev,
        { id: 0, chat: selected, sender: nickname || '我', content: text, type: 'self', sentTime: '', msgId: '', createdAt: Date.now() },
      ])
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '发送失败，微信可能未登录')
    } finally {
      setSending(false)
    }
  }

  const isSelf = (m: StoredMessage) => {
    const t = (m.type || '').toLowerCase()
    return t.includes('self') || m.sender === '我' || (!!nickname && m.sender === nickname)
  }
  const isSys = (m: StoredMessage) => SYS_TYPES.has((m.type || '').toLowerCase())

  const filtered = filter.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : rows

  return (
    <div className="flex h-full justify-center bg-[var(--color-muted)]">
      {/* 手机框 */}
      <div className="relative flex h-full w-full max-w-[460px] flex-col overflow-hidden bg-[#ededed] text-[#191919] shadow-xl">

        {view === 'list' ? (
          <>
            {/* 微信首页顶栏 */}
            <div className="flex h-12 items-center justify-center border-b border-[#d8d8d8] bg-[#ededed] text-[17px] font-medium">
              微信{online && rows.reduce((n, r) => n + r.unread, 0) > 0 ? `(${rows.reduce((n, r) => n + r.unread, 0)})` : ''}
            </div>

            {!online && (
              <div className="bg-[#fdf0d5] px-4 py-2 text-[12px] text-[#8a6d1b]">
                未连上 PC sidecar。请在装微信的电脑上跑 <code className="rounded bg-black/10 px-1">python-services/wechat/start.bat</code> 并保持微信登录。
                {health?.error ? `（${health.error}）` : ''}
              </div>
            )}

            {/* 搜索框 */}
            <div className="bg-[#ededed] px-3 py-2">
              <div className="flex h-8 items-center justify-center gap-1 rounded-[6px] bg-white text-[14px] text-[#9b9b9b]">
                <Search className="size-4" />
                <input
                  className="w-40 bg-transparent text-center text-[#191919] placeholder:text-[#9b9b9b] focus:outline-none"
                  placeholder="搜索"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>

            {/* 会话列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-white">
              {filtered.length === 0 && (
                <div className="px-6 py-10 text-center text-[13px] text-[#9b9b9b]">
                  暂无会话。{online ? '点进任一会话并刷新即开始监听，新消息会推到这里。' : 'sidecar 连上后这里会出现你的聊天。'}
                </div>
              )}
              {filtered.map((r) => (
                <button
                  key={r.name}
                  onClick={() => openChat(r.name)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-[#d9d9d9]"
                >
                  <div className="relative">
                    <Avatar name={r.name} />
                    {r.unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-[#fa5151] px-1 text-[11px] leading-[18px] text-white">
                        {r.unread > 99 ? '99+' : r.unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 border-b border-[#ededed] pb-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[16px]">{r.name}</span>
                      <span className="shrink-0 text-[12px] text-[#b2b2b2]">{listTime(r.lastAt)}</span>
                    </div>
                    <div className="truncate text-[13px] text-[#9b9b9b]">
                      {r.lastContent || (listening.has(r.name) ? '监听中…' : ' ')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 会话详情顶栏 */}
            <div className="relative flex h-12 items-center justify-center border-b border-[#d8d8d8] bg-[#ededed]">
              <button onClick={() => setView('list')} className="absolute left-1 flex items-center px-2 py-1 text-[#191919] active:opacity-60">
                <ChevronLeft className="size-6" />
              </button>
              <span className="max-w-[60%] truncate text-[17px] font-medium">{selected}</span>
              <button
                onClick={refreshLive}
                className="absolute right-2 flex items-center gap-1 px-2 py-1 text-[13px] active:opacity-60"
                title={listening.has(selected ?? '') ? '监听中，点刷新' : '开始监听并刷新'}
              >
                <RotateCw className={`size-4 ${refreshing ? 'animate-spin' : ''} ${listening.has(selected ?? '') ? 'text-[#07c160]' : 'text-[#576b95]'}`} />
              </button>
            </div>

            {/* 消息区 */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#ededed] px-3 py-3">
              {messages.length === 0 && (
                <div className="py-10 text-center text-[12px] text-[#9b9b9b]">
                  暂无消息。点右上角刷新开始监听这个会话。
                </div>
              )}
              {messages.map((m, i) => {
                if (isSys(m)) {
                  return (
                    <div key={m.id || `${m.createdAt}-${i}`} className="flex justify-center">
                      <span className="rounded bg-[#dcdcdc] px-2 py-0.5 text-[11px] text-[#7a7a7a]">{m.content}</span>
                    </div>
                  )
                }
                const self = isSelf(m)
                const showName = !self && !!m.sender && m.sender !== selected
                return (
                  <div key={m.id || `${m.createdAt}-${i}`} className={`flex items-start gap-2 ${self ? 'flex-row-reverse' : ''}`}>
                    <Avatar name={self ? (nickname || '我') : m.sender || selected || '?'} size={38} />
                    <div className={`flex max-w-[72%] flex-col ${self ? 'items-end' : 'items-start'}`}>
                      {showName && <span className="mb-0.5 px-1 text-[11px] text-[#9b9b9b]">{m.sender}</span>}
                      <div
                        className={`whitespace-pre-wrap break-words rounded-[4px] px-3 py-2 text-[15px] leading-snug ${
                          self ? 'bg-[#95ec69] text-[#191919]' : 'bg-white text-[#191919]'
                        }`}
                      >
                        {m.content || ' '}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 输入栏 */}
            <div className="flex items-center gap-2 border-t border-[#d8d8d8] bg-[#f7f7f7] px-2 py-2">
              <input
                className="h-9 flex-1 rounded-[6px] bg-white px-3 text-[15px] focus:outline-none disabled:opacity-60"
                placeholder={online ? '' : 'sidecar 未连接'}
                value={draft}
                disabled={!online || sending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button
                onClick={send}
                disabled={!online || sending || !draft.trim()}
                className="flex h-9 items-center gap-1 rounded-[6px] bg-[#07c160] px-4 text-[14px] font-medium text-white disabled:bg-[#9be0b8]"
              >
                <Send className="size-4" /> 发送
              </button>
            </div>
          </>
        )}

        {toast && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/75 px-4 py-2 text-[13px] text-white">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

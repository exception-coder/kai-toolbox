import type { CollaborationWorkbenchProps } from '../contracts'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { renderChatMarkdown } from '../../chatMarkdown'
import { ArrowDown, CheckCircle2, ChevronDown, MessageSquare } from 'lucide-react'
import { Button, Input } from '../ui'
import { useForgeRelay } from '../application/useForgeRelay'
import { businessMessage, extractRequirement } from '../model/requirementDraft'
import { ForgeRelayQuestions } from './ForgeRelayQuestions'
import { ForgeRelayComposer } from './ForgeRelayComposer'
import { RequirementDraftCard } from './RequirementDraftCard'
import './forgeRelay.css'

const connectionLabels = { idle: '尚未连接', connecting: '正在连接', connected: '已连接', offline: '连接已断开', terminal: '授权已失效' }

export function CollaborationWorkbench(props: CollaborationWorkbenchProps) {
  return <Workbench key={props.identity} {...props} />
}

function Workbench({ identity, adapter, context }: CollaborationWorkbenchProps) {
  const invitationId = useId()
  const relay = useForgeRelay(identity, adapter)
  const [invitation, setInvitation] = useState('')
  const [tab, setTab] = useState<'chat' | 'draft'>('chat')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const scroll = useRef<HTMLDivElement>(null)
  const { view, busy } = relay
  const connected = view.connection === 'connected'
  const source = useMemo(() => {
    for (const message of [...view.messages].reverse()) {
      if (message.role === 'assistant') { const result = extractRequirement(message.text); if (result) return result }
    }
  }, [view.messages])
  const history = view.messages.filter(message => relay.historyIds.has(message.id))
  const messages = view.messages.filter(message => !relay.historyIds.has(message.id))
  useEffect(() => { if (atBottom && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [view.messages, view.question, atBottom])
  return <div className="forge-collaboration-workbench"><div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
      <div className="min-w-0"><p className="text-xs text-[var(--color-secondary)]">{context.systemName} / {context.moduleName}</p><p aria-live="polite" className="mt-1 flex items-center gap-2 text-sm font-medium"><CheckCircle2 className={`size-3.5 ${connected ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`} />{view.session?.title ?? '需求澄清'} · {connectionLabels[view.connection]}</p></div>
      <div className="flex gap-1 lg:hidden"><Button type="button" size="sm" variant={tab === 'chat' ? 'secondary' : 'ghost'} onClick={() => setTab('chat')}>对话</Button><Button type="button" size="sm" variant={tab === 'draft' ? 'secondary' : 'ghost'} onClick={() => setTab('draft')}>需求稿{source ? ' · 已生成' : ''}</Button></div>
    </div>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={`min-h-0 flex-col ${tab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
        <div ref={scroll} onScroll={e => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80) }} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {view.error && <div role="alert" className="rounded border border-[var(--color-border)] p-3 text-sm text-[var(--color-danger)]">{view.error}</div>}
          {view.connection === 'terminal' && <p className="text-sm">请联系会话所有者恢复授权或领取新的邀请码。</p>}
          {!connected && <form className="space-y-3 rounded border border-[var(--color-border)] p-4" onSubmit={e => { e.preventDefault(); const code = invitation.trim(); if (code && !busy) { setInvitation(''); void relay.connect(code) } }}>
            <label htmlFor={invitationId} className="block text-sm font-medium">一次性邀请码</label>
            <Input id={invitationId} type="password" autoComplete="off" value={invitation} disabled={busy} onChange={e => setInvitation(e.target.value)} />
            <p className="text-xs text-[var(--color-secondary)]">向会话所有者领取“仅提交需求”授权的邀请码。</p>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !invitation.trim()}>配对并连接</Button>{view.connection !== 'terminal' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void relay.connect()}>恢复已有会话</Button>}</div>
          </form>}
          {view.session?.profile === 'DELEGATED_DEVELOPMENT' && <p className="border-l-2 border-[var(--color-border)] pl-3 text-xs leading-5 text-[var(--color-secondary)]">当前授权为“受约束开发”，后台仍具有该画像的能力。若只需需求分析，请让会话所有者签发“仅提交需求”授权。</p>}
          {view.session?.profile === 'REQUEST_ONLY' && <p className="text-xs text-[var(--color-muted)]">仅提交和澄清需求 · 写操作由会话所有者接管</p>}
          {history.length > 0 && <div><Button type="button" size="sm" variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><ChevronDown className="size-4" />{historyOpen ? '收起' : '展开'}此前会话 · {history.length} 条</Button>{historyOpen && <div className="mt-4 space-y-5"><Messages messages={history} /></div>}</div>}
          <section aria-label="会话消息" className="space-y-5">{messages.length === 0 ? <div className="py-8"><MessageSquare className="mb-4 size-5 text-[var(--color-muted)]" /><h3 className="text-lg font-semibold">把问题说清楚，一起完善需求。</h3><p className="mt-2 text-sm leading-6 text-[var(--color-secondary)]">描述当前场景和你期待的结果。助手结合绑定项目的上下文追问，帮助整理可交接的需求稿。</p><div className="mt-5 space-y-2 text-sm text-[var(--color-muted)]"><p>需求：希望在借用列表中筛选逾期记录</p><p>BUG：扫码后出现错误，附上操作步骤和截图</p><p>优化：重复录入太多，希望减少操作</p></div></div> : <Messages messages={messages} />}</section>
          {view.progress && <p aria-live="polite" className="text-xs text-[var(--color-muted)]">{view.progress}</p>}
          {view.question && <ForgeRelayQuestions key={view.question.requestId} question={view.question} disabled={busy || !connected} onAnswer={answers => void relay.run(active => active.answerQuestion(view.question!.requestId, answers)).then(ok => { if (ok) relay.dismissQuestion() })} />}
        </div>
        {!atBottom && <Button type="button" size="sm" variant="secondary" className="mx-auto mb-2" onClick={() => { setAtBottom(true); scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) }}><ArrowDown className="size-3" />回到最新消息</Button>}
        <ForgeRelayComposer context={context} relay={relay} disabled={busy || !connected} />
      </div>
      <div className={`min-h-0 border-[var(--color-border)] lg:border-l ${tab === 'draft' ? 'block' : 'hidden lg:block'}`}><RequirementDraftCard source={source} /></div>
    </div>
  </div></div>
}

function Messages({ messages }: { messages: { id: string; role: string; text: string }[] }) {
  return <>{messages.map(message => <article key={message.id} className={message.role === 'user' ? 'ml-6 rounded-lg bg-[var(--color-surface-subtle)] p-4' : 'py-1'}>
    <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">{message.role === 'user' ? '你' : '需求助手'}</p>
    <div className="relay-markdown text-sm leading-7" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(businessMessage(extractRequirement(message.text) ? message.text.replace(/```requirement-json[\s\S]*?```/g, '**需求草稿已生成，请在需求稿中载入并核对。**') : message.text)) }} />
  </article>)}</>
}

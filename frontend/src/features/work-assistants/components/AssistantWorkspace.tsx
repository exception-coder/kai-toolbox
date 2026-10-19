import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Download, History, LockKeyhole, Plus, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useAuth } from '@/lib/auth'
import { Markdown, ComposerFileDropZone } from '@/features/claude-chat/public-api'
import { VoiceInputButton } from '@/features/claude-chat/public-api/voice'
import { getCatalog, getSession, listSessions, createSession, sendMessage, cancelTurn, type Scope, type Session } from '../api'
import type { AssistantMemory } from '../runtime/AssistantHost'
import { RobotPortrait } from './RobotPortrait'
import { AssistantSetup } from './AssistantSetup'
import { SecureResourceForm } from './SecureResourceForm'
import { ResourceIntake } from './ResourceIntake'
import '../styles.css'

export function AssistantWorkspace({ selection, memory, onSecureDirtyChange, onSecureBusyChange }: { selection: { assistant?: string; session?: string; revision: number }; memory: AssistantMemory; onSecureDirtyChange?: (dirty: boolean) => void; onSecureBusyChange?: (busy: boolean) => void }) {
  const query = useQueryClient()
  const { user } = useAuth()
  const owner = user?.userId
  const confirm = useConfirm()
  const [secureDirty, setSecureDirty] = useState(false), [secureBusy, setSecureBusy] = useState(false)
  const dirtyChanged = useCallback((value: boolean) => { setSecureDirty(value); onSecureDirtyChange?.(value) }, [onSecureDirtyChange])
  const busyChanged = useCallback((value: boolean) => { setSecureBusy(value); onSecureBusyChange?.(value) }, [onSecureBusyChange])
  const leaveSecure = async (action: () => void) => {
    if (secureBusy) return
    if (secureDirty && !await confirm({ title: '清除未保存的登记信息？', description: '切换后会清除当前表单和密码。', confirmText: '清除并切换' })) return
    action()
  }
  const [assistantId, setAssistant] = useState(selection.assistant || memory.assistantId || 'weekly')
  const [sessionId, setSessionId] = useState<string | undefined>(selection.session || (!selection.assistant || memory.assistantId === selection.assistant ? memory.sessionId : undefined))
  const [draft, setDraft] = useState(() => memory.drafts[selection.session || memory.sessionId || 'new'] || '')
  const [setup, setSetup] = useState(assistantId === 'resources'), [history, setHistory] = useState(false), [secure, setSecure] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const mounted = useRef(true), identity = useRef(sessionId), input = useRef<HTMLTextAreaElement>(null)
  const request = useRef<{ id: string; session: string; text: string } | null>(null)
  const creation = useRef(crypto.randomUUID())
  const catalog = useQuery({ queryKey: ['work-assistants', owner, 'catalog'], queryFn: getCatalog, staleTime: 60_000 })
  const sessions = useQuery({ queryKey: ['work-assistants', owner, 'sessions'], queryFn: listSessions })
  const current = useQuery({ queryKey: ['work-assistants', owner, 'session', sessionId], queryFn: () => getSession(sessionId!), enabled: !!sessionId,
    refetchInterval: state => state.state.data?.turns.some(turn => turn.status === 'RUNNING') ? 1500 : false })
  const active = current.data?.turns.find(turn => turn.status === 'RUNNING')
  const assistant = catalog.data?.assistants.find(item => item.id === assistantId)
  const setupVersion = memory.selectionVersion
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const changeDraft = (text: string) => { memory.drafts[sessionId || 'new'] = text; setDraft(text) }
  const select = (id: string, target?: string) => {
    if (memory.assistantId !== id || memory.sessionId !== target) memory.selectionVersion = (memory.selectionVersion || 0) + 1
    memory.assistantId = id; memory.sessionId = target; identity.current = target
    setAssistant(id); setSessionId(target); setDraft(memory.drafts[target || 'new'] || '')
    setSetup(false); setHistory(false); setSecure(false); setError(''); setNotice('')
  }
  useEffect(() => {
    if (selection.assistant || selection.session) {
      const target = selection.session || sessions.data?.find(item => item.assistantId === selection.assistant)?.id
      select(selection.assistant || 'weekly', target)
      if (selection.assistant === 'resources' && !selection.session) setSetup(true)
    }
    // 请求选择只在目录读取后及显式唤醒时应用，轮询不重新选择会话。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.revision, !!sessions.data])
  const open = async (engine: string, model: string, scope: Scope, initialInput: string) => {
    const version = memory.selectionVersion
    setBusy(true); setError('')
    try {
      const value = await createSession({ assistantId, newTask: true, engine, model, scope, requestId: creation.current })
      if (memory.selectionVersion === version) {
        memory.sessionId = value.id; memory.assistantId = value.assistantId
        if (mounted.current) { select(value.assistantId, value.id); creation.current = crypto.randomUUID() }
      }
      query.setQueryData(['work-assistants', owner, 'session', value.id], value)
      void query.invalidateQueries({ queryKey: ['work-assistants', owner, 'sessions'] })
      memory.drafts[value.id] = initialInput
      if (mounted.current && identity.current === value.id) setDraft(initialInput)
      const initialRequest = request.current?.session === value.id && request.current.text === initialInput ? request.current.id : crypto.randomUUID()
      request.current = { id: initialRequest, session: value.id, text: initialInput }
      await sendMessage(value.id, initialRequest, initialInput)
      if (memory.drafts[value.id] === initialInput) memory.drafts[value.id] = ''
      if (memory.drafts['setup:weekly'] === initialInput) delete memory.drafts['setup:weekly']
      if (mounted.current && identity.current === value.id) setDraft(currentDraft => currentDraft === initialInput ? '' : currentDraft)
      void query.invalidateQueries({ queryKey: ['work-assistants', owner, 'session', value.id] })
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '任务准备失败') }
    finally { if (mounted.current) setBusy(false) }
  }
  const send = async () => {
    if (!sessionId || !draft.trim() || active || busy || current.isError || !current.data) return
    const sid = sessionId, text = draft
    const token = request.current?.session === sid && request.current.text === text ? request.current.id : crypto.randomUUID()
    request.current = { id: token, session: sid, text }; setBusy(true); setError('')
    try {
      await sendMessage(sid, token, text)
      if (memory.drafts[sid] === text) memory.drafts[sid] = ''
      if (mounted.current && identity.current === sid) setDraft(currentDraft => currentDraft === text ? '' : currentDraft)
      void query.invalidateQueries({ queryKey: ['work-assistants', owner, 'session', sid] })
    } catch (failure) { if (mounted.current && identity.current === sid) setError(failure instanceof Error ? failure.message : '发送失败，草稿保留，请先刷新任务核对结果') }
    finally { if (mounted.current) setBusy(false) }
  }
  const download = (session: Session, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${session.title.replace(/[<>:"/\\|?*]/g, '-')}.md`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const drop = async (files: FileList) => {
    const sid = sessionId
    try {
      if (files.length !== 1 || files[0].size > 256 * 1024 || !/\.(txt|md|csv|json)$/i.test(files[0].name)) throw new Error('请每次拖入一个不超过 256 KiB 的 TXT、Markdown、CSV 或 JSON；Office 文件暂未接入此助理。')
      const text = await files[0].text()
      if (/((password|passwd|pwd|密码|token|secret|私钥)\s*[:=：]|PRIVATE KEY)/i.test(text)) throw new Error('文件可能包含凭据，请使用安全登记，不要附加到普通对话。')
      const original = memory.drafts[sid || 'new'] || ''
      if (text.length + original.length > 12000) throw new Error('附件文字与草稿合计超过 12000 字符，请精简后重试。')
      if (mounted.current && identity.current === sid) changeDraft(`${original}\n\n附件 ${files[0].name}：\n${text}`)
    } catch (failure) { if (mounted.current && identity.current === sid) setError(failure instanceof Error ? failure.message : '文件读取失败') }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
      <RobotPortrait kind={assistantId} size={40} /><div className="min-w-0 flex-1"><h2 className="font-semibold">{assistant?.name || '工作助理'}</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{current.data ? `${current.data.engine} · 专属任务会话` : '选择伙伴，开始协作'}</p></div>
      <Button variant="ghost" className="min-h-11" disabled={secureBusy} aria-label="查看助理历史" onClick={() => void leaveSecure(() => { setHistory(value => !value); setSecure(false) })}><History className="size-4" /></Button>
      <Button variant="outline" className="min-h-11" disabled={busy || secureBusy} onClick={() => void leaveSecure(() => { creation.current = crypto.randomUUID(); setSetup(true); setSecure(false); setHistory(false) })}><Plus className="mr-2 size-4" />新任务</Button>
    </div>
    <div className="flex gap-2 border-b px-5 py-2" role="group" aria-label="切换助理">{catalog.data?.assistants.map(item => <button key={item.id} disabled={!item.enabled || busy || secureBusy} aria-pressed={assistantId === item.id} onClick={() => void leaveSecure(() => { select(item.id, sessions.data?.find(value => value.assistantId === item.id)?.id); if (item.id === 'resources') setSetup(true) })} className={`min-h-11 rounded-md px-3 text-sm ${assistantId === item.id ? 'bg-[var(--color-accent)] font-medium' : 'text-[var(--color-muted-foreground)]'}`}>{item.name}</button>)}</div>
    {catalog.isError && <p role="alert" className="p-5 text-sm">助理目录不可用，<button className="min-h-11 underline" onClick={() => void catalog.refetch()}>重新读取</button></p>}
    {error && <p role="alert" className="shrink-0 break-words px-5 py-3 text-sm text-[var(--color-destructive)]">{error}</p>}
    {notice && <p role="status" className="px-5 py-2 text-xs">{notice}</p>}
    {!sessionId && !sessions.isSuccess ? <div role={sessions.isError ? 'alert' : 'status'} className="p-5 text-sm"><p>{sessions.isError ? '任务目录读取失败，请先恢复后再创建，避免重复任务。' : '正在恢复最近的助理任务…'}</p>{sessions.isError && <Button className="mt-3" variant="outline" onClick={() => void sessions.refetch()}>重新读取</Button>}</div>
      : secure ? <SecureResourceForm onDirtyChange={dirtyChanged} onBusyChange={busyChanged} onClose={() => { setSecure(false); input.current?.focus() }} />
      : history ? <div className="min-h-0 flex-1 overflow-y-auto p-5"><h3 className="mb-3 text-sm font-medium">任务历史</h3>{sessions.data?.filter(value => value.assistantId === assistantId).map(value => <button key={value.id} className="min-h-14 w-full border-b py-3 text-left text-sm" onClick={() => select(value.assistantId, value.id)}>{value.title}</button>)}<Button className="mt-4" variant="ghost" onClick={() => setHistory(false)}>返回对话</Button></div>
      : setup || !sessionId ? assistantId === 'resources' ? <ResourceIntake onDirtyChange={dirtyChanged} onBusyChange={busyChanged} onManual={() => setSecure(true)} onClose={() => { setSetup(false); input.current?.focus() }} /> : <div className="min-h-0 flex-1 overflow-y-auto"><AssistantSetup key={assistantId} assistant={assistantId} projects={catalog.data?.projects || []} busy={busy} initialInput={memory.drafts['setup:weekly']} onInputChange={value => { memory.drafts['setup:weekly'] = value }} onPlanningChange={setBusy} onStart={async (...args) => { if (memory.selectionVersion === setupVersion) await open(...args) }} /></div>
      : <>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-label="助理任务对话">
          {current.isPending && <div role="status" className="h-24 animate-pulse rounded bg-[var(--color-muted)]" />}
          {current.isError && <div role="alert" className="space-y-3 text-sm"><p>任务读取失败，已保留草稿。请刷新核对结果后再发送。</p><Button variant="outline" onClick={() => void current.refetch()}>重新读取任务</Button></div>}
          {current.data?.turns.length === 0 && <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">{assistantId === 'weekly' ? 'Git 事实已采集。告诉我希望怎样呈现，例如“整理成可发给领导的简洁周报”。' : '可以问我如何整理环境资源，或点击下方“安全登记”保存连接与账号。'}</p>}
          {current.data?.turns.map(turn => <article key={turn.id} className="space-y-4 border-b py-5 first:pt-0"><p className="whitespace-pre-wrap break-words rounded-md bg-[var(--color-muted)] px-4 py-3 text-sm">{turn.input}</p>
            {turn.output && <div className="min-w-0 break-words text-sm"><Markdown text={turn.output} /><div className="mt-3 flex gap-2"><Button aria-label="复制助理结果" variant="ghost" onClick={() => void navigator.clipboard.writeText(turn.output).then(() => setNotice('已复制结果')).catch(() => setError('复制失败，请选择正文复制'))}><Copy className="mr-2 size-4" />复制</Button><Button variant="ghost" onClick={() => download(current.data!, turn.output)}><Download className="mr-2 size-4" />下载 Markdown</Button></div></div>}
            {turn.status === 'RUNNING' && <p role="status" className="text-sm text-[var(--color-muted-foreground)]">正在处理 · 收起窗口后任务仍会继续</p>}
            {turn.error && <div role="alert" className="text-sm"><p>{turn.error}</p><Button className="mt-2" variant="outline" disabled={!!active || busy} onClick={() => changeDraft(turn.input)}>放回草稿，核对后重试</Button></div>}
          </article>)}
        </div>
        <ComposerFileDropZone sessionId={sessionId} onFiles={drop} disabledReason={busy ? '正在提交，请稍后添加文字附件' : undefined} className="shrink-0 space-y-3 border-t p-4">
          {assistantId === 'resources' && <Button variant="outline" className="min-h-11" onClick={() => setSetup(true)}><LockKeyhole className="mr-2 size-4" />粘贴登记连接与主机</Button>}
          <textarea ref={input} aria-label="给工作助理的消息" className="wa-field max-h-40 min-h-24 resize-y" value={draft} maxLength={12000} placeholder="说说需要处理的工作…（请勿输入密码）" onChange={event => changeDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
          <div className="flex flex-wrap items-center gap-2"><VoiceInputButton key={sessionId} scope="work-assistants" disabled={busy || !!active} onText={text => changeDraft(`${draft}${draft ? '\n' : ''}${text}`)} /><span className="min-w-0 flex-1 text-xs text-[var(--color-muted-foreground)]">Ctrl / ⌘ + Enter 发送 · 可拖入文字附件</span>
            {active ? <Button variant="outline" disabled={busy} onClick={() => void cancelTurn(sessionId, active.id).then(() => current.refetch()).catch(() => setError('取消请求失败，请刷新核对任务状态'))}><Square className="mr-2 size-4" />取消任务</Button>
              : <Button disabled={busy || !draft.trim() || !current.data || current.isError} onClick={() => void send()}><Send className="mr-2 size-4" />{busy ? '提交中…' : '交给助理'}</Button>}
          </div>
        </ComposerFileDropZone>
      </>}
    {setup && sessionId && <Button className="m-3 shrink-0" variant="ghost" onClick={() => setSetup(false)}><ArrowLeft className="mr-2 size-4" />返回原任务</Button>}
  </div>
}

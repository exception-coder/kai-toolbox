import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Paperclip, Send, Slash, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { useDraft } from '../lib/draftPref'
import { useDraftAttachments } from '../lib/attachmentDraftPref'
import { listSessions, uploadAttachment } from '../api'
import { ensureNotifyPermission } from '../browserNotify'
import { CommandMenu } from './CommandMenu'
import { MessageList } from './MessageList'
import { SessionTotalBadge } from './SessionTotalBadge'
import { EngineIcon } from './EngineIcon'
import { CodexTransportBadge } from './CodexTransportBadge'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { ModeSwitch } from './ModeSwitch'
import { ProviderSwitch } from './ProviderSwitch'
import { AttachmentChips } from './AttachmentChips'
import { VoiceInputButton } from './VoiceInputButton'
import { ProjectMentionButton, ProjectMentionMenu, useProjectMention } from './ProjectMention'
import { agentStatusMeta, deriveAgentStatus, engineDisplayName, providerHost, type AgentStatus } from './chatStatus'
import { ProviderDiagPanel } from './ProviderDiagPanel'
import type { PrdSessionView } from '@/features/prd-clarify/types'
import { countPrdReferenceDocuments, uploadPrdReference } from '../lib/prdReference'
import { SessionPlanLockNotice } from './SessionPlanLockNotice'
import { SessionRuntimeHealth } from './SessionRuntimeHealth'

interface Props {
  /** 本块续接的会话 id。 */
  sessionId: string
  /** 该 Agent 的区分色（hex），用于块头染色。 */
  accent: string
  /** 上报本块业务状态，供分屏概览展示。 */
  onStatus: (status: AgentStatus) => void
  /** 从分屏移除本块。 */
  onClose: () => void
}

/** 单条消息最多附件数，与单会话视图、后端约定一致。 */
const MAX_ATTACHMENTS = 10

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}

/**
 * 分屏中的单个 Agent 会话块：自带独立 WS（useClaudeChatSocket 自包含），挂载后续接指定会话，
 * 与其它块**同时并存可交互**（各自发消息/流式回复/图片上传/语音/权限与提问）。
 * 块头按 Agent 区分色染色 + 状态点，报错时顶部红色状态条突出。
 */
export function SessionPane({ sessionId, accent, onStatus, onClose }: Props) {
  const chat = useClaudeChatSocket()
  // 草稿本地持久化（按 sessionId），与主视图/悬浮窗共用同一份存储：切视图/刷新页面都不丢。
  const [draft, setDraft] = useDraft(sessionId)
  // 附件走共享 store（按 sessionId），与主界面/悬浮窗同一份，切视图不丢。
  const [attachments, setAttachments] = useDraftAttachments(sessionId)
  const [uploading, setUploading] = useState(0)
  const [cmdMenuOpen, setCmdMenuOpen] = useState(false) // 「指令」菜单（命令 + 模型切换）
  const taRef = useRef<HTMLTextAreaElement>(null)
  const handlePrdMention = useCallback(async (prdSession: PrdSessionView) => {
    if (!chat.sessionId) throw new Error('请先创建或打开会话')
    const required = countPrdReferenceDocuments(prdSession)
    const available = MAX_ATTACHMENTS - attachments.length - uploading
    if (required > available) throw new Error(`引用该 PRD 需要 ${required} 个附件名额，当前仅剩 ${Math.max(available, 0)} 个`)
    setUploading(count => count + required)
    try {
      const added = await uploadPrdReference(chat.sessionId, prdSession)
      setAttachments(current => [...current, ...added])
    } finally {
      setUploading(count => count - required)
    }
  }, [attachments.length, chat.sessionId, setAttachments, uploading])
  const projectMention = useProjectMention(draft, setDraft, taRef, { onPickPrd: handlePrdMention })
  const fileRef = useRef<HTMLInputElement>(null)

  // 标题取自会话列表缓存（与单会话视图共用同一 query 缓存）
  const { data: sessions = [] } = useQuery({ queryKey: ['claude-chat-sessions'], queryFn: listSessions, staleTime: 5000 })
  const meta = sessions.find(s => s.id === sessionId)
  const planLocked = meta?.planExpired === true

  // 挂载（或 sessionId 变化）后续接一次该会话。若列表缓存里该会话此刻仍是 RUNNING+live，
  // 乐观带上 hintRunning——分屏刚接进来就知道要不要显示「中断」，不用等 Ready 校正
  // （ready 只会把 running 关掉、不会点亮，见 useClaudeChatSocket 里 switchTo 的说明）。
  const switchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (switchedRef.current === sessionId) return
    switchedRef.current = sessionId
    chat.switchTo(sessionId, meta?.status === 'RUNNING' && meta?.live)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, chat])

  // 派生并上报业务状态（用 ref 持有 onStatus，避免父回调 identity 变化导致的重复触发）
  const status = deriveAgentStatus(chat.state, chat.running, chat.items, chat.errorMessage)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  useEffect(() => {
    onStatusRef.current({ kind: status.kind, errorText: status.errorText, count: status.count })
  }, [status.kind, status.errorText, status.count])
  const title = meta?.title?.trim() || (meta ? shortCwd(meta.cwd) : sessionId.slice(0, 8))

  const pending = chat.pending

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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }

  const submit = () => {
    if (planLocked) return
    if (!chat.sessionId) return
    if (!draft.trim() && attachments.length === 0) return
    ensureNotifyPermission()
    // 带上 mime + 本地预览 url → 气泡里显示图片缩略图（与单会话视图一致）；
    // 不在此 revoke object URL：它已被消息气泡引用（revoke 会让缩略图失效）。
    chat.send(draft, attachments.map(a => ({ name: a.name, path: a.path, mime: a.mime, url: a.previewUrl })))
    setDraft('')
    setAttachments([])
    const el = taRef.current
    if (el) el.style.height = 'auto'
  }

  const sm = agentStatusMeta(status.kind)
  const atMax = attachments.length + uploading >= MAX_ATTACHMENTS
  const engineLabel = engineDisplayName(chat.currentEngine, chat.currentProviderKind)
  const host = providerHost(chat.currentProviderBaseUrl)
  const engineTitle = chat.currentProviderKind === 'thirdParty'
    ? `第三方网关：${host ?? chat.currentProviderBaseUrl ?? '未知'}`
    : undefined
  const handleLoadEarlier = useCallback(() => chat.loadHistory(false), [chat.loadHistory])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)]">
      {/* 块头：左侧 Agent 区分色竖条 + 轻量染色背景 + 状态 + 关闭 */}
      <div
        className="flex items-center gap-2 border-b px-2.5 py-1.5"
        style={{ backgroundColor: `${accent}14`, borderLeft: `3px solid ${accent}` }}
      >
        <span className={`size-2.5 shrink-0 rounded-full ${sm.dot}${sm.pulse ? ' animate-pulse' : ''}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={meta?.cwd}>{title}</span>
        <SessionTotalBadge items={chat.items} />
        {/* 分屏每块都很窄，引擎只留品牌图标；完整名称在 title 里 */}
        <EngineIcon
          engine={chat.currentEngine}
          thirdParty={chat.currentProviderKind === 'thirdParty'}
          className="size-3.5"
          title={engineTitle}
          aria-label={engineLabel}
        />
        <CodexTransportBadge
          engine={chat.currentEngine}
          providerKind={chat.currentProviderKind}
          diag={chat.providerDiag}
          compact
        />
        <span className={`shrink-0 text-xs font-medium ${sm.text}`}>{sm.label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭此块"
          className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 报错状态条：不让用户自己翻聊天记录 */}
      {status.kind === 'error' && status.errorText && (
        <div className="flex items-start gap-2 border-b border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{status.errorText}</span>
        </div>
      )}

      {/* 消息流：flex 列容器，MessageList 靠 flex-1 拿到有界高度并内部滚动 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList
          sessionKey={sessionId}
          items={chat.items}
          running={chat.running}
          onLoadEarlier={handleLoadEarlier}
          loadingEarlier={chat.historyLoading}
          exhausted={chat.historyExhausted}
          onFork={chat.forkSession}
          engineLabel={engineLabel}
          onCleanRetry={chat.cleanRetry}
          turnTokens={chat.turnTokens}
          connState={chat.state}
        />
      </div>

      <SessionRuntimeHealth sessionId={chat.sessionId} running={chat.running} />

      {/* 第三方网关调用诊断（可展开，紧凑）：仅第三方会话显示 */}
      <ProviderDiagPanel
        providerKind={chat.currentProviderKind}
        providerBaseUrl={chat.currentProviderBaseUrl}
        currentModel={chat.currentModel}
        diag={chat.providerDiag}
        compact
      />

      {/* 输入条：附件预览 + 模式 + 附件/语音/输入/发送 */}
      <div className="border-t bg-[var(--color-muted)] px-2 py-1.5">
        <AttachmentChips
          items={attachments}
          uploading={uploading}
          onRemove={id => setAttachments(prev => {
            const t = prev.find(a => a.id === id)
            if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
            return prev.filter(a => a.id !== id)
          })}
        />
        <div className="mb-1 flex items-center gap-1">
          <ModeSwitch engine={chat.currentEngine} mode={chat.mode} onChange={chat.setMode} />
          {/* 服务商切换与权限组语义不同，推到右侧分开 */}
          <div className="ml-auto">
            <ProviderSwitch
              engine={chat.currentEngine}
              providerKind={chat.currentProviderKind}
              providerBaseUrl={chat.currentProviderBaseUrl}
              onSwitch={chat.switchProvider}
              onPickModel={chat.setModel}
              align="right"
            />
          </div>
        </div>
        {/* 指令菜单（命令 + 模型切换）：内嵌于输入区上方，避免窄块 overflow-hidden 裁切下拉 */}
        {cmdMenuOpen && !planLocked && (
          <CommandMenu
            inline
            commands={chat.slashCommands}
            models={chat.models}
            currentModel={chat.currentModel}
            engine={chat.currentEngine}
            onClose={() => setCmdMenuOpen(false)}
            onPickCommand={cmd => { setDraft(d => (d.trim() ? `${d} ` : '') + '/' + cmd + ' '); setCmdMenuOpen(false); taRef.current?.focus() }}
            onPickAssistant={prompt => { setDraft(prompt); setCmdMenuOpen(false); taRef.current?.focus() }}
            onPickModel={value => { chat.setModel(value); setCmdMenuOpen(false) }}
          />
        )}
        <ProjectMentionMenu
          open={projectMention.open}
          references={projectMention.references}
          activeIndex={projectMention.activeIndex}
          loading={projectMention.loading}
          warning={projectMention.warning}
          actionError={projectMention.actionError}
          busyKey={projectMention.busyKey}
          className="mb-1"
          onPick={reference => { void projectMention.pickReference(reference) }}
        />
        <SessionPlanLockNotice session={meta} compact />
        <div className="flex items-end gap-1">
          {/* 附件：label 包 input，保留原生触发（移动端 WebView 不丢手势） */}
          <label
            aria-label="添加附件"
            title="添加图片 / 文档"
            className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--color-accent)]${atMax ? ' pointer-events-none opacity-50' : ''}`}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              disabled={planLocked || atMax}
              onChange={e => handleFiles(e.target.files)}
            />
            <Paperclip className="size-4 text-[var(--color-primary)]" />
          </label>
          {/* 指令：命令补全 + 第三方模型切换（复刻全屏「指令」入口） */}
          <button
            type="button"
            onClick={() => setCmdMenuOpen(o => !o)}
            disabled={planLocked}
            aria-label="指令"
            title="指令（命令 / 切换模型）"
            className={`flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 ${cmdMenuOpen ? 'bg-[var(--color-accent)]' : ''}`}
          >
            <Slash className="size-4 text-[var(--color-primary)]" />
          </button>
          <ProjectMentionButton
            active={projectMention.open}
            disabled={planLocked}
            className="rounded-md border-0"
            onToggle={() => {
              setCmdMenuOpen(false)
              projectMention.togglePicker()
            }}
          />
          <VoiceInputButton
            disabled={planLocked || chat.running}
            onText={t => setDraft(d => d.trim() ? `${d} ${t}` : t)}
          />
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => {
              projectMention.handleChange(e.target.value, e.target.selectionStart)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (projectMention.handleKeyDown(e)) return
              if (e.key === 'Enter' && !e.shiftKey) {
                if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return // 触屏回车换行
                e.preventDefault(); if (!chat.running) submit()
              }
            }}
            rows={1}
            disabled={planLocked}
            placeholder="发消息…（可粘贴图片）"
            className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
          />
          {chat.running ? (
            <Button variant="outline" size="icon" onClick={chat.interrupt} disabled={chat.interrupting}
              aria-label={chat.interrupting ? '正在中断' : '中断'} title={chat.interrupting ? '正在校正会话状态' : '中断'} className="shrink-0">
              {chat.interrupting ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
            </Button>
          ) : (
            <Button size="icon" onClick={submit} disabled={planLocked || (!draft.trim() && attachments.length === 0)} aria-label="发送" className="shrink-0">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 本块独立的权限 / 提问弹窗 */}
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

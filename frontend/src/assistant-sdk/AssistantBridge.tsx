import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useClaudeChatSocket } from '@/features/claude-chat/public-api'
import { http } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { initializeAssistant } from './assistantSdk'
import { AssistantCollector } from './collector'
import { buildAssistantDeveloperInstructions } from './prompt'
import { projectConversationMessages, resolveConversationState } from './conversationProjection'
import type { AssistantContextSnapshot, AssistantMode, AssistantWidgetState } from './types'

interface PendingSubmission {
  mode: AssistantMode
  text: string
  snapshot: AssistantContextSnapshot
}

interface DraftView {
  id: string
}

interface RegistrationView {
  requirementId: string
  alreadySaved: boolean
}

interface IntentView {
  intent: AssistantMode | 'UNKNOWN'
  confidence: number
  reason: string
}

/** kai-toolbox 宿主薄适配：SDK/Widget 与既有 consult WebSocket 会话之间的唯一接线点。 */
export function AssistantBridge() {
  const location = useLocation()
  const auth = useAuth()
  const chat = useClaudeChatSocket({ channel: 'consult', autoConnect: false })
  const collector = useMemo(() => new AssistantCollector({ ignoreUrls: ['/api/assistant/'] }), [])
  const sdkRef = useRef<ReturnType<typeof initializeAssistant> | null>(null)
  const pendingRef = useRef<PendingSubmission | null>(null)
  const restoringSessionRef = useRef<string | null>(null)
  const queuedCountRef = useRef(0)
  queuedCountRef.current = chat.queued.length

  const emitState = useCallback((detail: AssistantWidgetState) => {
    const root = document.getElementById('kai-assistant-widget-root')
    root?.dispatchEvent(new CustomEvent('kai-assistant-state', {
      detail: { queueSize: queuedCountRef.current, ...detail },
    }))
  }, [])

  useEffect(() => {
    collector.start()
    const sdk = initializeAssistant({
      appId: 'KAI_TOOLBOX',
      appName: 'kai-toolbox',
      user: auth.user ? {
        id: String(auth.user.userId), displayName: auth.user.username, roles: auth.user.roles,
      } : undefined,
      page: { url: location.pathname + location.search, title: document.title },
      providers: [{
        id: 'runtime-evidence',
        collect: async () => ({ key: 'runtimeEvidence', value: collector.diagnosticWindow() }),
      }],
    })
    sdkRef.current = sdk
    return () => {
      collector.stop()
      sdk.destroy()
      sdkRef.current = null
    }
  }, [auth.user, collector, emitState])

  useEffect(() => {
    sdkRef.current?.updateContext({
      user: auth.user ? {
        id: String(auth.user.userId), displayName: auth.user.username, roles: auth.user.roles,
      } : undefined,
      page: { url: location.pathname + location.search, title: document.title },
    })
  }, [auth.user, location.pathname, location.search])

  const deliver = useCallback((submission: PendingSubmission) => {
    if (!chat.sessionId) {
      pendingRef.current = submission
      emitState({ state: '正在连接' })
      return
    }
    const developerInstructions = buildAssistantDeveloperInstructions(submission.mode, submission.snapshot)
    const envelope = {
      protocolVersion: submission.snapshot.protocolVersion,
      mode: submission.mode,
      contextSnapshot: submission.snapshot as unknown as Record<string, unknown>,
    }
    void http(`/assistant/sessions/${encodeURIComponent(chat.sessionId)}/context`, {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: submission.snapshot.protocolVersion,
        snapshot: submission.snapshot,
      }),
    }).then(() => {
      if (chat.running || chat.pending || chat.backgroundTasks.length > 0) {
        chat.enqueue(submission.text, undefined, undefined, developerInstructions)
        emitState({ state: '消息处理中', message: '消息已进入待发送列表' })
        return
      }
      chat.send(submission.text, undefined, undefined, developerInstructions, envelope)
      emitState({ state: '回复中' })
    }).catch(error => emitState({ state: '上下文保存失败', message: error instanceof Error ? error.message : String(error) }))
  }, [chat, emitState])

  useEffect(() => {
    const root = document.getElementById('kai-assistant-widget-root')
    if (!root) return
    const submit = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: AssistantMode; text: string }>).detail
      void sdkRef.current?.snapshot().then(async snapshot => {
        const routed = detail.mode === 'AUTO'
          ? await http<IntentView>('/assistant/intents/route', {
              method: 'POST', body: JSON.stringify(detail),
            })
          : { intent: detail.mode, confidence: 1, reason: '用户显式选择模式' } satisfies IntentView
        const mode = routed.intent === 'UNKNOWN' ? 'AUTO' : routed.intent
        const submission = { text: detail.text, mode, snapshot }
        if (!chat.sessionId || chat.state !== 'ready') {
          pendingRef.current = submission
          emitState({ state: '正在连接' })
          if (!chat.sessionId) {
            const savedSessionId = loadAssistantSessionId(auth.user?.userId)
            if (savedSessionId) {
              restoringSessionRef.current = savedSessionId
              chat.switchTo(savedSessionId)
            } else {
              chat.open('.', undefined, 'plan', 'codex')
            }
          }
          return
        }
        deliver(submission)
      }).catch(error => emitState({ state: '准备失败', message: error instanceof Error ? error.message : String(error) }))
    }
    const saveDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: string; title: string; description: string }>).detail
      const snapshotPromise = sdkRef.current?.snapshot()
      if (!snapshotPromise || !chat.sessionId) {
        emitState({ state: '草稿未保存', message: '请先发送一次消息以建立会话' })
        return
      }
      void snapshotPromise.then(snapshot => http<DraftView>('/assistant/drafts', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: chat.sessionId,
          kind: detail.kind,
          title: detail.title,
          description: detail.description,
          contextSnapshot: snapshot,
          evidence: collector.diagnosticWindow(),
        }),
      })).then(draft => emitState({ state: '草稿已保存', message: `草稿编号：${draft.id}`, draftId: draft.id }))
        .catch(error => emitState({ state: '草稿保存失败', message: error instanceof Error ? error.message : String(error) }))
    }
    const confirmDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ draftId: string; engineerUserId?: number }>).detail
      const idempotencyKey = draftIdempotencyKey(detail.draftId)
      void http<RegistrationView>(`/assistant/drafts/${encodeURIComponent(detail.draftId)}/confirm`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ engineerUserId: detail.engineerUserId }),
      }).then(result => emitState({ state: '已保存', message: `需求编号：${result.requirementId}` }))
        .catch(error => emitState({ state: '登记失败', message: error instanceof Error ? error.message : String(error) }))
    }
    root.addEventListener('assistant-submit', submit)
    root.addEventListener('assistant-save-draft', saveDraft)
    root.addEventListener('assistant-confirm-draft', confirmDraft)
    return () => {
      root.removeEventListener('assistant-submit', submit)
      root.removeEventListener('assistant-save-draft', saveDraft)
      root.removeEventListener('assistant-confirm-draft', confirmDraft)
    }
  }, [chat, collector, deliver, emitState])

  useEffect(() => {
    if (chat.state !== 'ready' || !pendingRef.current) return
    restoringSessionRef.current = null
    const submission = pendingRef.current
    pendingRef.current = null
    deliver(submission)
  }, [chat.state, deliver])

  useEffect(() => {
    if (!chat.sessionId) return
    saveAssistantSessionId(auth.user?.userId, chat.sessionId)
  }, [auth.user?.userId, chat.sessionId])

  useEffect(() => {
    if (!restoringSessionRef.current || !pendingRef.current || !chat.errorMessage) return
    if (!/不存在|不能访问|forbidden|not found/i.test(chat.errorMessage)) return
    clearAssistantSessionId(auth.user?.userId)
    restoringSessionRef.current = null
    chat.open('.', undefined, 'plan', 'codex')
  }, [auth.user?.userId, chat, chat.errorMessage])

  useEffect(() => {
    const messages = projectConversationMessages(chat.items, chat.running)
    emitState({
      state: resolveConversationState({
        connectionState: chat.state,
        running: chat.running,
        pending: Boolean(chat.pending),
        backgroundTaskCount: chat.backgroundTasks.length,
        queuedCount: chat.queued.length,
        errorMessage: chat.errorMessage,
        messageCount: messages.length,
      }),
      message: chat.errorMessage || undefined,
      messages,
    })
  }, [
    chat.backgroundTasks.length,
    chat.errorMessage,
    chat.items,
    chat.pending,
    chat.queued.length,
    chat.running,
    chat.state,
    emitState,
  ])

  return null
}

function draftIdempotencyKey(draftId: string): string {
  const storageKey = `kai-assistant:idempotency:${draftId}`
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) return stored
  } catch {
    // 服务端还有草稿唯一约束；本地存储不可用时仍允许安全重试。
  }
  const generated = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = Math.floor(Math.random() * 16)
        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
      })
  try {
    localStorage.setItem(storageKey, generated)
  } catch {
    // 服务端草稿唯一约束负责最终幂等。
  }
  return generated
}

function assistantSessionStorageKey(userId?: number): string {
  return `kai-assistant:session:KAI_TOOLBOX:${userId ?? 'anonymous'}`
}

function loadAssistantSessionId(userId?: number): string | null {
  try {
    return localStorage.getItem(assistantSessionStorageKey(userId))
  } catch {
    return null
  }
}

function saveAssistantSessionId(userId: number | undefined, sessionId: string): void {
  try {
    localStorage.setItem(assistantSessionStorageKey(userId), sessionId)
  } catch {
    // 会话仍可在当前页面使用，持久化失败不影响宿主。
  }
}

function clearAssistantSessionId(userId?: number): void {
  try {
    localStorage.removeItem(assistantSessionStorageKey(userId))
  } catch {
    // 忽略宿主禁用本地存储的场景。
  }
}

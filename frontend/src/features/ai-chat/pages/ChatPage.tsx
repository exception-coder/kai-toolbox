import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { usePrompt } from '@/components/ui/prompt-dialog'
import {
  createConversation,
  deleteConversation,
  fetchMessages,
  fetchModels,
  listConversations,
  updateConversation,
} from '../api'
import { useChatStream } from '../hooks/useChatStream'
import type { AttachmentView, ConversationView, MessageView, ModelsView, RolePreset } from '../types'
import { ConversationList } from '../components/ConversationList'
import { MessageList } from '../components/MessageList'
import { Composer } from '../components/Composer'
import { SettingsDrawer } from '../components/SettingsDrawer'

export function ChatPage() {
  const confirm = useConfirm()
  const prompt = usePrompt()

  const [modelsView, setModelsView] = useState<ModelsView | null>(null)
  const [conversations, setConversations] = useState<ConversationView[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageView[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [banner, setBanner] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [seed, setSeed] = useState<string | undefined>(undefined)

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const stream = useChatStream({
    onFinal: (payload) => {
      setMessages((prev) => [
        ...prev,
        {
          id: payload.messageId,
          conversationId: activeId ?? '',
          role: 'ASSISTANT',
          content: payload.content,
          model: selectedModel,
          attachments: [],
          status: payload.status,
          createdAt: Date.now(),
          latencyMs: payload.latencyMs,
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
          totalTokens: payload.totalTokens,
          cachedTokens: payload.cachedTokens,
        },
      ])
      void refreshConversations()
    },
    onError: (message) => setBanner(message),
  })

  const refreshConversations = useCallback(async () => {
    const list = await listConversations()
    setConversations(list)
    return list
  }, [])

  // 初始化：模型清单 + 会话列表。
  useEffect(() => {
    void (async () => {
      try {
        const mv = await fetchModels()
        setModelsView(mv)
        const list = await refreshConversations()
        if (list.length > 0) setActiveId(list[0].id)
      } catch (e) {
        setBanner(e instanceof Error ? e.message : '加载失败')
      }
    })()
  }, [refreshConversations])

  // 切换会话：拉历史 + 同步模型/温度。
  useEffect(() => {
    if (!activeConv) {
      setMessages([])
      return
    }
    setSelectedModel(activeConv.model)
    setTemperature(activeConv.temperature ?? 0.7)
    void (async () => {
      try {
        const page = await fetchMessages(activeConv.id)
        setMessages(page.messages)
      } catch (e) {
        setBanner(e instanceof Error ? e.message : '拉取消息失败')
      }
    })()
  }, [activeConv])

  async function handleNew() {
    const model = selectedModel || modelsView?.models[0]?.id
    if (!model) {
      setBanner('暂无可用模型，请先在配置中心填好 4sapi 的 api-key')
      return
    }
    const conv = await createConversation({ model })
    setConversations((prev) => [conv, ...prev])
    setActiveId(conv.id)
    setMessages([])
  }

  async function handleRename(id: string) {
    const current = conversations.find((c) => c.id === id)
    const title = await prompt({ title: '重命名对话', defaultValue: current?.title ?? '', confirmText: '保存' })
    if (title == null) return
    const updated = await updateConversation(id, { title })
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: '删除对话', description: '该对话的所有消息将一并删除，不可恢复。', variant: 'destructive' })
    if (!ok) return
    await deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) {
      setActiveId((prev) => {
        const rest = conversations.filter((c) => c.id !== id)
        return rest.length > 0 ? rest[0].id : null
      })
    }
  }

  async function handleModelChange(id: string) {
    setSelectedModel(id)
    if (activeConv) {
      const updated = await updateConversation(activeConv.id, { model: id })
      setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? updated : c)))
    }
  }

  async function handlePickPreset(preset: RolePreset) {
    if (!activeConv) return
    const updated = await updateConversation(activeConv.id, { systemPrompt: preset.systemPrompt })
    setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? updated : c)))
  }

  function handleSend(content: string, attachments: AttachmentView[]) {
    if (!activeConv) return
    setBanner(null)
    const userMsg: MessageView = {
      id: `local_${Date.now()}`,
      conversationId: activeConv.id,
      role: 'USER',
      content,
      model: null,
      attachments,
      status: 'DONE',
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    void stream
      .send({
        conversationId: activeConv.id,
        content,
        attachmentIds: attachments.map((a) => a.id),
        model: selectedModel,
        temperature,
      })
      .catch((e) => setBanner(e instanceof Error ? e.message : '发送失败'))
  }

  async function refreshModels() {
    try {
      setModelsView(await fetchModels(true))
    } catch (e) {
      setBanner(e instanceof Error ? e.message : '刷新模型失败')
    }
  }

  // 轻量 Alert 的「重试」：重载模型 + 会话列表
  async function retry() {
    setBanner(null)
    try {
      setModelsView(await fetchModels(true))
      await refreshConversations()
    } catch (e) {
      setBanner(e instanceof Error ? e.message : '重试失败')
    }
  }

  // 空状态点能力建议：无会话先新建，再把建议文案灌入输入框
  async function handlePickSuggestion(text: string) {
    if (!activeConv) await handleNew()
    setSeed(text)
  }

  const models = modelsView?.models ?? []
  const presets = modelsView?.presets ?? []

  const currentModelLabel = models.find((m) => m.id === selectedModel)?.label ?? selectedModel ?? '默认模型'

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[var(--color-muted)]/40">
      <aside className="w-64 shrink-0 border-r bg-[var(--color-background)]">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b bg-[var(--color-background)] px-4 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{activeConv?.title ?? 'AI 对话'}</h2>
            {activeConv?.systemPrompt && (
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                系统提示：{activeConv.systemPrompt}
              </p>
            )}
          </div>
          {/* 当前模型 chip + 设置：参数收进抽屉，不在聊天里抢戏 */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="会话设置（模型 / 温度 / 角色）"
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-[var(--color-background)] px-3 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            <span className="max-w-[10rem] truncate text-[var(--color-foreground)]">{currentModelLabel}</span>
            {modelsView?.source === 'fallback' && <span className="text-amber-600 dark:text-amber-400">·兜底</span>}
            <Settings2 className="size-3.5" />
          </button>
        </header>

        {banner && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{banner}</span>
            <button type="button" onClick={retry} className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">重试</button>
            <button type="button" onClick={() => setBanner(null)} aria-label="关闭" className="shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900"><X className="size-3.5" /></button>
          </div>
        )}

        <MessageList
          messages={messages}
          streaming={stream.streaming}
          streamText={stream.streamText}
          onPickSuggestion={handlePickSuggestion}
        />

        <Composer
          models={models}
          selectedModel={selectedModel}
          streaming={stream.streaming}
          disabled={!activeConv}
          seed={seed}
          onSeedApplied={() => setSeed(undefined)}
          onSend={handleSend}
          onStop={stream.stop}
        />
      </main>

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        models={models}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        presets={presets}
        activeSystemPrompt={activeConv?.systemPrompt ?? null}
        onPickPreset={handlePickPreset}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        fallback={modelsView?.source === 'fallback'}
        onRefreshModels={refreshModels}
        disabled={!activeConv}
      />
    </div>
  )
}

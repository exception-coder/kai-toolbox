import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
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

  const models = modelsView?.models ?? []
  const presets = modelsView?.presets ?? []

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="w-64 shrink-0 border-r">
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
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{activeConv?.title ?? 'AI 对话'}</h2>
            {activeConv?.systemPrompt && (
              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                系统提示：{activeConv.systemPrompt}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {modelsView?.source === 'fallback' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">模型清单为兜底（4sapi 不可达）</span>
            )}
            <Button variant="ghost" size="icon" title="刷新模型清单" onClick={refreshModels}>
              <RefreshCw />
            </Button>
          </div>
        </header>

        {banner && (
          <div className="bg-[var(--color-destructive)]/10 px-4 py-2 text-sm text-[var(--color-destructive)]">
            {banner}
          </div>
        )}

        <MessageList messages={messages} streaming={stream.streaming} streamText={stream.streamText} />

        <Composer
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          presets={presets}
          onPickPreset={handlePickPreset}
          temperature={temperature}
          onTemperatureChange={setTemperature}
          streaming={stream.streaming}
          disabled={!activeConv}
          onSend={handleSend}
          onStop={stream.stop}
        />
      </main>
    </div>
  )
}

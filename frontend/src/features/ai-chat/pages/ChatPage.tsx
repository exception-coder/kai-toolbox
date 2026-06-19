import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
import type { AttachmentView, CompletionDebug, ConversationView, MessageView, ModelsView, RolePreset } from '../types'
import { ConversationList } from '../components/ConversationList'
import { MessageList } from '../components/MessageList'
import { Composer } from '../components/Composer'
import { SettingsDrawer } from '../components/SettingsDrawer'
import { SessionTotalBadge } from '../components/SessionTotalBadge'
import { HeaderModelPicker } from '../components/HeaderModelPicker'
import { TemperatureControl } from '../components/TemperatureControl'
import { UsageChip } from '../components/UsageChip'
import { ImagePanel } from '../components/ImagePanel'
import { DebugPanel } from '../components/DebugPanel'

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
  const [debugOpen, setDebugOpen] = useState(false)
  const [debug, setDebug] = useState<CompletionDebug | null>(null)
  const [seed, setSeed] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<'chat' | 'image'>('chat')
  const [imageModel, setImageModel] = useState('')

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
      if (payload.debug) setDebug(payload.debug)
      void refreshConversations()
    },
    onError: (message) => setBanner(message),
    onDebug: (d) => setDebug(d),
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
        const imgs = mv.models.filter((m) => m.category === 'image')
        if (imgs.length > 0) setImageModel(imgs[0].id)
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

  const allModels = modelsView?.models ?? []
  // 旧后端无 category 时按 chat 处理，保证兼容。
  const models = allModels.filter((m) => !m.category || m.category === 'chat') // 对话模型
  const imageModels = allModels.filter((m) => m.category === 'image')
  const presets = modelsView?.presets ?? []

  // 按当前模式决定模型选择器的清单/选中/回调
  const pickerModels = mode === 'image' ? imageModels : models
  const pickerValue = mode === 'image' ? imageModel : selectedModel
  const onPickerChange = mode === 'image' ? setImageModel : handleModelChange

  // 选中模型是否支持自定义温度；仅对话模式、支持才在标题栏显示温度滑块。
  const supportsTemperature =
    mode === 'chat' && (models.find((m) => m.id === selectedModel)?.supportsTemperature ?? false)

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
          {/* 模式切换（对话/绘图）+ 模型选择（按模式过滤）作为标题栏主路径 */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex shrink-0 items-center rounded-full border p-0.5 text-xs">
              {([['chat', '对话'], ['image', '绘图']] as const).map(([m, text]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded-full px-2.5 py-1 font-medium',
                    mode === m
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
                  )}
                >
                  {text}
                </button>
              ))}
              <span className="px-2 py-1 text-[var(--color-muted-foreground)]/50" title="视频生成（异步任务）待开发">视频</span>
            </div>
            <HeaderModelPicker
              models={pickerModels}
              value={pickerValue}
              onChange={onPickerChange}
              fallback={modelsView?.source === 'fallback'}
              onRefresh={refreshModels}
              disabled={mode === 'chat' && !activeConv}
            />
            {mode === 'chat' && activeConv && supportsTemperature && (
              <TemperatureControl value={temperature} onChange={setTemperature} />
            )}
            {mode === 'chat' && activeConv?.title && (
              <span className="hidden truncate text-sm text-[var(--color-muted-foreground)] sm:inline" title={activeConv.systemPrompt ? `系统提示：${activeConv.systemPrompt}` : undefined}>
                {activeConv.title}
              </span>
            )}
            {mode === 'chat' && <SessionTotalBadge messages={messages} />}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <UsageChip />
            <button
              type="button"
              onClick={() => setDebugOpen(true)}
              title="调试信息（最近一次请求/响应）"
              className={cn(
                'flex size-8 items-center justify-center rounded-full border bg-[var(--color-background)] hover:bg-[var(--color-accent)]',
                debug ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]',
              )}
              aria-label="调试信息"
            >
              <Bug className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              title="高级参数（角色 / 温度）"
              className="flex size-8 items-center justify-center rounded-full border bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              aria-label="高级参数"
            >
              <Settings2 className="size-4" />
            </button>
          </div>
        </header>

        {banner && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{banner}</span>
            <button type="button" onClick={retry} className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">重试</button>
            <button type="button" onClick={() => setBanner(null)} aria-label="关闭" className="shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900"><X className="size-3.5" /></button>
          </div>
        )}

        {mode === 'image' ? (
          <ImagePanel model={imageModel} />
        ) : (
          <>
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
          </>
        )}
      </main>

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        presets={presets}
        activeSystemPrompt={activeConv?.systemPrompt ?? null}
        onPickPreset={handlePickPreset}
        disabled={!activeConv}
      />

      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} debug={debug} />
    </div>
  )
}

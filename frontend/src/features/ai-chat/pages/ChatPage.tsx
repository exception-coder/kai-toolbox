import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, Menu, Settings2, X } from 'lucide-react'
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
import { VideoPanel } from '../components/VideoPanel'
import { DebugPanel } from '../components/DebugPanel'

export function ChatPage() {
  const confirm = useConfirm()
  const prompt = usePrompt()

  const [modelsView, setModelsView] = useState<ModelsView | null>(null)
  const [conversations, setConversations] = useState<ConversationView[]>([])
  const [activeByKind, setActiveByKind] = useState<Record<'chat' | 'image' | 'video', string | null>>({
    chat: null, image: null, video: null,
  })
  const [messages, setMessages] = useState<MessageView[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [banner, setBanner] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false) // 移动端会话抽屉
  const [debugOpen, setDebugOpen] = useState(false)
  const [debug, setDebug] = useState<CompletionDebug | null>(null)
  const [seed, setSeed] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<'chat' | 'image' | 'video'>('chat')
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')

  // 当前 tab 对应的激活会话 id;切 tab 时各自记忆,互不干扰。
  const activeId = activeByKind[mode]
  const setActiveId = useCallback(
    (id: string | null) => setActiveByKind((prev) => ({ ...prev, [mode]: id })),
    [mode],
  )

  // 左侧列表只显示当前 tab 类型的会话(旧数据无 kind 时归入 chat)。
  const visibleConversations = useMemo(
    () => conversations.filter((c) => (c.kind ?? 'chat') === mode),
    [conversations, mode],
  )

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
        const vids = mv.models.filter((m) => m.category === 'video')
        if (vids.length > 0) setVideoModel(vids[0].id)
        const list = await refreshConversations()
        // 各类型分别选中其最近一条会话(列表已按 updated_at 倒序)。
        const firstOf = (k: string) => list.find((c) => (c.kind ?? 'chat') === k)?.id ?? null
        setActiveByKind({ chat: firstOf('chat'), image: firstOf('image'), video: firstOf('video') })
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
    // 仅对话会话同步到顶部对话模型选择器/温度;绘图/视频模型各自独立。
    if ((activeConv.kind ?? 'chat') === 'chat') {
      setSelectedModel(activeConv.model)
      setTemperature(activeConv.temperature ?? 0.7)
    }
    void (async () => {
      try {
        const page = await fetchMessages(activeConv.id)
        setMessages(page.messages)
      } catch (e) {
        setBanner(e instanceof Error ? e.message : '拉取消息失败')
      }
    })()
  }, [activeConv])

  // 绘图/视频面板:确保有归属会话(无则按当前 kind 新建),返回会话 id 供提交用。
  const ensureConversation = useCallback(
    async (model: string): Promise<string> => {
      const current = conversations.find((c) => c.id === activeByKind[mode]) ?? null
      if (current && (current.kind ?? 'chat') === mode) {
        return current.id
      }
      const conv = await createConversation({ model, kind: mode })
      setConversations((prev) => [conv, ...prev])
      setActiveByKind((prev) => ({ ...prev, [mode]: conv.id }))
      return conv.id
    },
    [conversations, activeByKind, mode],
  )

  // 媒体生成后重新拉取当前会话消息,使结果以持久化消息形式出现。
  const reloadMessages = useCallback(async () => {
    const id = activeByKind[mode]
    if (!id) return
    try {
      const page = await fetchMessages(id)
      setMessages(page.messages)
      void refreshConversations()
    } catch {
      /* 忽略,下次切会话会重新拉 */
    }
  }, [activeByKind, mode, refreshConversations])

  async function handleNew() {
    const model =
      mode === 'image' ? imageModel || imageModels[0]?.id
      : mode === 'video' ? videoModel || videoModels[0]?.id
      : selectedModel || models[0]?.id
    if (!model) {
      setBanner(mode === 'chat' ? '暂无可用模型，请先在配置中心填好 4sapi 的 api-key' : `当前无可用${mode === 'image' ? '绘图' : '视频'}模型`)
      return
    }
    const conv = await createConversation({ model, kind: mode })
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
      const rest = visibleConversations.filter((c) => c.id !== id)
      setActiveId(rest.length > 0 ? rest[0].id : null)
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
  const videoModels = allModels.filter((m) => m.category === 'video')
  const presets = modelsView?.presets ?? []

  // 按当前模式决定模型选择器的清单/选中/回调
  const pickerModels = mode === 'image' ? imageModels : mode === 'video' ? videoModels : models
  const pickerValue = mode === 'image' ? imageModel : mode === 'video' ? videoModel : selectedModel
  const onPickerChange = mode === 'image' ? setImageModel : mode === 'video' ? setVideoModel : handleModelChange

  // 选中模型是否支持自定义温度；仅对话模式、支持才在标题栏显示温度滑块。
  const supportsTemperature =
    mode === 'chat' && (models.find((m) => m.id === selectedModel)?.supportsTemperature ?? false)

  // 侧栏内容（桌面常驻 / 移动抽屉共用）；移动端选会话或新建后自动收起抽屉。
  const sidebar = (
    <ConversationList
      conversations={visibleConversations}
      activeId={activeId}
      onSelect={(id) => { setActiveId(id); setSidebarOpen(false) }}
      onNew={() => { void handleNew(); setSidebarOpen(false) }}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[var(--color-muted)]/40">
      {/* 桌面：常驻侧栏 */}
      <aside className="hidden w-64 shrink-0 border-r bg-[var(--color-background)] md:block">
        {sidebar}
      </aside>
      {/* 移动：抽屉式侧栏 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col border-r bg-[var(--color-background)] shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-1.5 border-b bg-[var(--color-background)] px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4">
          {/* 模式切换（对话/绘图）+ 模型选择（按模式过滤）作为标题栏主路径 */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="会话列表"
              title="会话列表"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] md:hidden"
            >
              <Menu className="size-4" />
            </button>
            <div className="flex shrink-0 items-center rounded-full border p-0.5 text-xs">
              {([['chat', '对话'], ['image', '绘图'], ['video', '视频']] as const).map(([m, text]) => (
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
            </div>
            <HeaderModelPicker
              models={pickerModels}
              value={pickerValue}
              onChange={onPickerChange}
              fallback={modelsView?.source === 'fallback'}
              onRefresh={refreshModels}
              disabled={mode === 'chat' && !activeConv}
            />
            {mode === 'chat' && activeConv?.title && (
              <span className="hidden truncate text-sm text-[var(--color-muted-foreground)] lg:inline" title={activeConv.systemPrompt ? `系统提示：${activeConv.systemPrompt}` : undefined}>
                {activeConv.title}
              </span>
            )}
          </div>
          {/* 次级控件：移动端独占第二行，避免和模型选择挤在一行 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {mode === 'chat' && activeConv && supportsTemperature && (
              <TemperatureControl value={temperature} onChange={setTemperature} />
            )}
            {mode === 'chat' && <SessionTotalBadge messages={messages} />}
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
          <ImagePanel
            model={imageModel}
            conversationId={activeConv?.id ?? null}
            messages={messages}
            onEnsureConversation={ensureConversation}
            onGenerated={reloadMessages}
          />
        ) : mode === 'video' ? (
          <VideoPanel
            model={videoModel}
            conversationId={activeConv?.id ?? null}
            messages={messages}
            onEnsureConversation={ensureConversation}
            onGenerated={reloadMessages}
          />
        ) : (
          <>
            <MessageList
              messages={messages}
              streaming={stream.streaming}
              streamText={stream.streamText}
              toolSteps={stream.toolSteps}
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

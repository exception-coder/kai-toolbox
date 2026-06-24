import { useCallback, useEffect, useRef, useState } from 'react'
import { http } from '@/lib/api'
import { ChatRuntimeProvider, useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { FloatingChatWindow } from '@/features/claude-chat/components/FloatingChatWindow'
import { WelfareSignPage, type BlockStyleMap } from '@/features/welfare-sign/pages/WelfareSignPage'
import type { WelfareConfig, WelfareTheme } from '@/features/welfare-sign/types'

/** 拉不到副本配置时的兜底端午皮肤，保证页面不空白。 */
const FALLBACK_CONFIG: WelfareConfig = {
  loginMode: 'SMS',
  redirectUrl: null,
  loginImageUrl: null,
  detailImageUrl: null,
  detailTitle: '端午安康',
  detailContent: '粽叶飘香，端午将至，一份来自公司的心意已为你备好。请确认收取，并留下你的签名。',
  popupEnabled: true,
  popupTitle: '一份端午的心意',
  popupContent: '请在确认福利品信息后完成签名。',
  signatureNotice: '本人确认已收到本次端午节福利品。',
  extraFieldsJson: null,
  updatedAt: Date.now(),
}

/**
 * 福利签收「免登录受约束 Vibe Coding 演示」。
 *
 * 直接复用原版组件：背景 = 真实 {@link WelfareSignPage}（fullscreen，配置取自本会话一次性副本库）；
 * 前景 = 原版 {@link FloatingChatWindow}（由 demo 版 {@link ChatRuntimeProvider} 驱动，连免登录受约束
 * 会话，屏蔽无关功能、仅留缩小/展开）。agent 经受约束的 welfare_db 改副本库 welfare_sign_config，
 * 每轮结束后演示页重拉配置即时反映；改动只作用于副本，真实环境零影响。
 */
export function WelfareDemoPage() {
  return (
    <ChatRuntimeProvider demo>
      <DemoStage />
      <FloatingChatWindow />
    </ChatRuntimeProvider>
  )
}

/** 背景演示页：随 demo 会话就绪 / 每轮结束重拉副本库配置并重挂载，使 agent 的改动即时可见。 */
function DemoStage() {
  const { chat, setConcierge, floating, minimized } = useChatRuntime()
  const sessionId = chat?.sessionId ?? null
  const running = chat?.running ?? false
  const [config, setConfig] = useState<WelfareConfig>(FALLBACK_CONFIG)
  const [theme, setTheme] = useState<WelfareTheme | undefined>(undefined)
  const [blocks, setBlocks] = useState<BlockStyleMap | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const wasRunning = useRef(false)
  // 仅展开对话框时显示区块角标（A/B/C…），便于用户指向区块精调；最小化成气泡时不打扰画面。
  const showRegionMarkers = floating && !minimized

  const refetch = useCallback(async () => {
    if (!sessionId) return
    try {
      const c = await http<WelfareConfig & { theme?: WelfareTheme }>(`/claude-chat/demo/welfare-config/${sessionId}`)
      setConfig(c)
      setTheme(c.theme)
      setBlocks(parseBlocks(c.theme?.blocksJson)) // 各区块精细样式覆盖
      setConcierge(c.theme?.conciergeImage ?? null) // 同步悬浮窗吉祥物
      setVersion((v) => v + 1)
    } catch {
      /* 无行/未就绪：保留当前配置，下轮再试 */
    }
  }, [sessionId, setConcierge])

  // 会话就绪（拿到 sessionId）即拉一次。
  useEffect(() => {
    void refetch()
  }, [refetch])

  // 每轮结束（running: true → false）重拉，反映 agent 刚改的配置。
  useEffect(() => {
    if (wasRunning.current && !running) void refetch()
    wasRunning.current = running
  }, [running, refetch])

  return (
    <div className="h-[100dvh] w-full overflow-hidden">
      <WelfareSignPage key={version} fullscreen demoConfig={config} theme={theme} blocks={blocks} showRegionMarkers={showRegionMarkers} />
    </div>
  )
}

/** 解析 theme.blocksJson（区块 ID → 样式覆盖）；非法/空则忽略，不影响默认皮肤。 */
function parseBlocks(raw?: string | null): BlockStyleMap | undefined {
  if (!raw?.trim()) return undefined
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as BlockStyleMap) : undefined
  } catch {
    return undefined
  }
}

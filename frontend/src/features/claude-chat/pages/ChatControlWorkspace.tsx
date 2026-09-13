import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAccessContext } from '@/shell/permission'
import { useMobileNavigation } from '@/shell/MobileNavigationContext'
import { Menu } from 'lucide-react'
import { ChatPage } from './ChatPage'
import { chatControlMode, controlModeSearch, type ChatControlMode } from '../lib/controlMode'

const LlmChatPage = lazy(() => import('@/features/ai-chat/public-api').then(m => ({ default: m.LlmChatPage })))

/** 只选择执行通道；两种会话、权限和协议由各自模块维护。 */
export function ChatControlWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const mode = chatControlMode(location.search)
  const [llmVisited, setLlmVisited] = useState(mode === 'LLM')
  useEffect(() => { if (mode === 'LLM') setLlmVisited(true) }, [mode])
  const access = useAccessContext()
  const openNavigation = useMobileNavigation()
  const allowedLlm = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:ai-chat')
  const allowedAgent = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
    || new URLSearchParams(location.search).has('prdSessionId')
  const renderControl = () => <div className="flex shrink-0 items-center gap-1">
    {mode === 'LLM' && openNavigation && <button type="button" onClick={openNavigation}
      aria-label="打开导航" className="flex size-8 items-center justify-center md:hidden"><Menu className="size-4" /></button>}
    <label className="flex shrink-0 items-center gap-1 text-xs">
    <span className="sr-only">控制模式</span>
    <select aria-label="控制模式" value={mode} className="h-8 max-w-36 rounded-md border bg-[var(--color-background)] px-2 text-xs"
      onChange={event => {
        const next = event.target.value as ChatControlMode
        if (next === 'LLM') setLlmVisited(true)
        navigate({ pathname: location.pathname, search: controlModeSearch(location.search, next), hash: location.hash })
      }}>
      <option value="CODE_AGENT" disabled={!allowedAgent}>Code Agent</option>
      <option value="LLM" disabled={!allowedLlm}>纯 LLM</option>
    </select>
    </label>
  </div>
  return <div className="h-full min-h-0">
    {mode === 'CODE_AGENT' && <ChatPage renderControl={renderControl} />}
    {(llmVisited || mode === 'LLM') && allowedLlm && <div className={mode === 'LLM' ? 'h-full min-h-0' : 'hidden'}>
      <Suspense fallback={<p role="status" className="p-4">正在加载纯 LLM 对话…</p>}><LlmChatPage renderControl={renderControl} /></Suspense>
    </div>}
  </div>
}

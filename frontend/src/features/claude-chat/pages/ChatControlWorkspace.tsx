import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAccessContext } from '@/shell/permission'
import { useMobileNavigation } from '@/shell/MobileNavigationContext'
import { Menu } from 'lucide-react'
import { ChatControlModePicker } from '../components/ChatControlModePicker'
import { ChatPage } from './ChatPage'
import { chatControlMode, controlModeSearch } from '../lib/controlMode'

const LlmChatPage = lazy(() => import('@/features/ai-chat/public-api').then(m => ({ default: m.LlmChatPage })))

/** 只选择执行通道；两种会话、权限和协议由各自模块维护。 */
export function ChatControlWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const mode = chatControlMode(location.search)
  const [llmVisited, setLlmVisited] = useState(mode === 'LLM')
  const focusRequested = useRef(false)
  const focusControl = useCallback((node: HTMLButtonElement | null) => {
    if (node && focusRequested.current) { node.focus(); focusRequested.current = false }
  }, [])
  useEffect(() => { if (mode === 'LLM') setLlmVisited(true) }, [mode])
  const access = useAccessContext()
  const openNavigation = useMobileNavigation()
  const allowedLlm = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:ai-chat')
  const allowedAgent = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
    || new URLSearchParams(location.search).has('prdSessionId')
  const renderControl = () => <div className="flex shrink-0 items-center gap-1">
    {mode === 'LLM' && openNavigation && <button type="button" onClick={openNavigation}
      aria-label="打开导航" className="flex size-8 items-center justify-center md:hidden"><Menu className="size-4" /></button>}
    <ChatControlModePicker mode={mode} allowedAgent={allowedAgent} allowedLlm={allowedLlm} triggerRef={focusControl}
      onChange={next => {
        focusRequested.current = true
        if (next === 'LLM') setLlmVisited(true)
        navigate({ pathname: location.pathname, search: controlModeSearch(location.search, next), hash: location.hash })
      }} />
  </div>
  return <div className="h-full min-h-0">
    {mode === 'CODE_AGENT' && <ChatPage renderControl={renderControl} />}
    {(llmVisited || mode === 'LLM') && allowedLlm && <div hidden={mode !== 'LLM'} className="h-full min-h-0">
      <Suspense fallback={<p role="status" className="p-4">正在加载自由对话…</p>}><LlmChatPage renderControl={mode === 'LLM' ? renderControl : undefined} /></Suspense>
    </div>}
  </div>
}

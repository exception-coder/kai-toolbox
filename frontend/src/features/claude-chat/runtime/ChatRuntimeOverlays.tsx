import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { isChatRoute, useChatRuntime } from './ChatRuntimeContext'

const FloatingChatWindow = lazy(() => import('../components/FloatingChatWindow').then(module => ({ default: module.FloatingChatWindow })))
const GlobalPendingQuestionModal = lazy(() => import('../components/GlobalPendingQuestionModal').then(module => ({ default: module.GlobalPendingQuestionModal })))

/** Keep the shared engine mounted; download overlay UI only when it is needed. */
export function ChatRuntimeOverlays() {
  const { chat, floating } = useChatRuntime()
  const { pathname } = useLocation()
  const showFloating = floating && !isChatRoute(pathname)
  const floatingAtStartup = useRef(floating).current
  const [floatingStarted, setFloatingStarted] = useState(showFloating)
  useEffect(() => { if (showFloating) setFloatingStarted(true) }, [showFloating])
  const hasBackgroundQuestion = chat?.pendingSessions.some(session => session.kind === 'question' && session.sessionId !== chat.sessionId)

  return (
    <>
      {chat && (showFloating || floatingStarted) && (
        <div hidden={!showFloating} className={showFloating && pathname.startsWith('/tools/fore-consult') ? 'hidden lg:block' : undefined}>
          <ErrorBoundary label="floating-chat" compact>
            <Suspense fallback={null}><FloatingChatWindow initialCompact={floatingAtStartup} /></Suspense>
          </ErrorBoundary>
        </div>
      )}
      {hasBackgroundQuestion && (
        <ErrorBoundary label="pending-question" compact>
          <Suspense fallback={null}><GlobalPendingQuestionModal /></Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}

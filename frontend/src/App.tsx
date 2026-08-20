import { Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/shell/AppShell'
import { ShowcaseLayout } from '@/shell/ShowcaseLayout'
import { HomePage } from '@/shell/HomePage'
import { features } from '@/shell/featureRegistry'
import { RouteGuard } from '@/components/auth/RouteGuard'
import { SessionExpiredGate } from '@/components/auth/SessionExpiredGate'
import { ChatRuntimeProvider } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { FloatingChatWindow } from '@/features/claude-chat/components/FloatingChatWindow'
import { GlobalPendingQuestionModal } from '@/features/claude-chat/components/GlobalPendingQuestionModal'
import { VoiceModeView } from '@/features/claude-chat/components/voice/VoiceModeView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AssistantBridge } from '@/assistant-sdk/AssistantBridge'

// 按布局把 feature 分两支：'showcase' 走全屏展示外壳（脱离 AppShell、公开免鉴权），
// 其余默认 'tool' 走 AppShell（Sidebar + TopBar）。Suspense 各自在对应外壳里。
const toolFeatures = features.filter(f => f.layout !== 'showcase')
const showcaseFeatures = features.filter(f => f.layout === 'showcase')

export default function App() {
  return (
    // 聊天运行时提到两套布局之上：悬浮窗跨「工具页 / 展示页 / 首页」全程常驻，会话不断
    <ChatRuntimeProvider>
    <Routes>
      {/* 展示页：全屏外壳，无侧边栏，不套 RouteGuard（公开）。Suspense 在 ShowcaseLayout 内 */}
      <Route element={<ShowcaseLayout />}>
        {showcaseFeatures.flatMap(f =>
          f.routes.map(r => <Route key={f.id + r.path} path={r.path} element={<ErrorBoundary label={f.id}>{r.element}</ErrorBoundary>} />)
        )}
      </Route>

      {/* 工具页：AppShell（Sidebar + TopBar），走鉴权 + 代码分割兜底 */}
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        {toolFeatures.flatMap(f =>
          f.routes.map(r => (
            <Route
              key={f.id + r.path}
              path={r.path}
              // 每个工具页都是 React.lazy 动态 import（代码分割），渲染时需 Suspense 边界托底。
              // fallback 只在该工具 chunk 首次下载期间一闪而过；首页/shell 不受影响。
              element={
                <RouteGuard feature={f}>
                  {/* 每个工具页各自套错误边界：某模块崩溃/断网加载失败只兜住内容区，侧边栏仍在，随时可切到别的模块 */}
                  <ErrorBoundary label={f.id}>
                    <Suspense fallback={<PageLoading />}>{r.element}</Suspense>
                  </ErrorBoundary>
                </RouteGuard>
              }
            />
          ))
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    {/* 悬浮窗/语音层/跨会话答题弹窗各自兜底：它们跨模块常驻，若自身崩溃也不能拖垮整个应用 */}
    <ErrorBoundary label="floating-chat" compact><FloatingChatWindow /></ErrorBoundary>
    <ErrorBoundary label="voice-mode" compact><VoiceModeView /></ErrorBoundary>
    <ErrorBoundary label="pending-question" compact><GlobalPendingQuestionModal /></ErrorBoundary>
    <ErrorBoundary label="assistant-bridge" compact><AssistantBridge /></ErrorBoundary>
    <SessionExpiredGate />
    </ChatRuntimeProvider>
  )
}

function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
      加载中…
    </div>
  )
}

function NotFound() {
  const location = useLocation()
  // 完整路由诊断：命中 404 = 当前路径未匹配任何已注册路由。打印所有 feature/路由，
  // 一眼看出「工具箱模块是否在注册表、注册了哪些路径」（常见原因：Vite dev 未热更到新 feature → 重启 dev）。
  useEffect(() => {
    const all = features.flatMap(f => f.routes.map(r => ({ id: f.id, name: f.name, layout: f.layout ?? 'tool', path: r.path })))
    const near = all.filter(r => r.path.split('/')[2] && location.pathname.includes(r.path.split('/')[2] ?? ' '))
    console.group(`[router] 404 未匹配：${location.pathname}`)
    console.log(`已注册 ${features.length} 个 feature、${all.length} 条路由`)
    console.table(all)
    if (near.length) console.warn('路径相近的已注册路由（可能拼写/前缀不一致）：', near)
    console.info('若你新增/拉取了模块却 404：多为 Vite dev 的 import.meta.glob 未热更到新 feature，重启 `npm run dev` 即可。')
    console.groupEnd()
  }, [location.pathname])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-muted-foreground)]">
      <div className="text-4xl font-bold tracking-tight">404</div>
      <div className="text-sm">页面不存在：<code>{location.pathname}</code></div>
      <div className="text-xs">已注册 {features.length} 个模块。完整路由清单见浏览器控制台（F12）。</div>
    </div>
  )
}

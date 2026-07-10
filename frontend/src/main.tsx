import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './lib/mock/loader'
import App from './App'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { PromptProvider } from '@/components/ui/prompt-dialog'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initTheme } from './shell/theme'

// 渲染前套用已存主题（明暗 + 主色），避免首屏闪烁
initTheme()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore registration failure */ })
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <PromptProvider>
            {/* 顶层兜底：连外壳/运行时都崩了也只显示可刷新的兜底页，而非整屏白屏无法访问 */}
            <ErrorBoundary label="app-root">
              <App />
            </ErrorBoundary>
          </PromptProvider>
        </ConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

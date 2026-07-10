import { Component, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, RotateCcw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  /** 出错模块标识，进日志便于定位。 */
  label?: string
  /** 极简兜底（如悬浮窗）：只渲染一个小重试条，不铺满。 */
  compact?: boolean
}
interface State { error: Error | null }

/**
 * 路由/模块级错误边界：把一个模块的运行时崩溃（渲染抛错、懒加载 chunk 拉取失败/断网）**就地兜住**，
 * 只让内容区显示可恢复的兜底页，而不是整棵 React 树卸载导致整个应用白屏无法访问。
 * 因边界只包在内容区外层，侧边栏/顶栏仍在，用户随时能切到其它模块（含 Vibe Coding）。
 *
 * React 的错误边界只能是 class 组件（getDerivedStateFromError / componentDidCatch）。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[ErrorBoundary]${this.props.label ? ' ' + this.props.label : ''}`, error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return <Fallback error={this.state.error} onReset={this.reset} compact={this.props.compact} />
  }
}

// 懒加载失败（断网 / 前端已更新导致旧 chunk 404）与普通渲染错误区别对待
function isChunkError(e: Error): boolean {
  return /dynamically imported module|imported module script failed|Failed to fetch|ChunkLoadError|Loading chunk|error loading dynamically/i.test(
    `${e.name} ${e.message}`,
  )
}

function Fallback({ error, onReset, compact }: { error: Error; onReset: () => void; compact?: boolean }) {
  const navigate = useNavigate()
  const chunk = isChunkError(error)

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-muted-foreground)]">
        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1 truncate">{chunk ? '加载失败（可能断网/已更新）' : '此处出错了'}</span>
        <button type="button" onClick={chunk ? () => location.reload() : onReset} className="shrink-0 rounded-md border px-2 py-1 hover:bg-[var(--color-accent)]">
          {chunk ? '刷新' : '重试'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-10 text-amber-500" />
      <div className="space-y-1">
        <div className="text-lg font-semibold">{chunk ? '模块加载失败' : '这个模块出错了'}</div>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          {chunk
            ? '可能是网络中断，或前端已更新（旧资源失效）。点「刷新页面」重新加载即可；其它模块不受影响。'
            : '仅此模块崩溃，应用其余部分仍可用——可重试本模块，或从左侧切到别的模块（如 Vibe Coding）。'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {chunk ? (
          <button type="button" onClick={() => location.reload()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm text-[var(--color-primary-foreground)]">
            <RefreshCw className="size-4" /> 刷新页面
          </button>
        ) : (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm text-[var(--color-primary-foreground)]">
            <RotateCcw className="size-4" /> 重试本模块
          </button>
        )}
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--color-accent)]">
          <Home className="size-4" /> 返回工作台
        </button>
      </div>
      <details className="max-w-md text-left text-xs text-[var(--color-muted-foreground)]">
        <summary className="cursor-pointer select-none">错误详情</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--color-muted)] p-2">{error.name}: {error.message}</pre>
      </details>
    </div>
  )
}

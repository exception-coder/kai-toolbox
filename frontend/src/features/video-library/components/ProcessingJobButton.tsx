import { useEffect, useRef, useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ApiError, subscribeSse } from '@/lib/api'
import type { ProcessingJob, StartTaskResponse } from '../api'

/**
 * 通用"视频处理任务"按钮：封装"启动/停止/进度刷新/SSE 订阅"四件事。
 *
 * 后端契约（与 VideoProcessingController 同构）：
 * - start  → 200 { jobId, total } / 409 { jobId, total, message } / 503 { message }
 * - stop   → 204
 * - status → 200 ProcessingJob | null
 * - events → SSE：init / progress / done
 *
 * 组件三态：
 * - idle    （无活动任务）→ 显示「启动」按钮
 * - running（任务运行中）→ 显示「停止」按钮 + 进度数字 `(123/1842)`
 * - finished（已结束，5 秒内可见结果摘要）→ 显示「再次启动」按钮 + 上次结果 hint
 */
export interface ProcessingJobApi {
  start: () => Promise<StartTaskResponse>
  stop: () => Promise<void>
  status: () => Promise<ProcessingJob | null>
  eventsPath: () => string
}

interface Props {
  label: string
  icon?: React.ReactNode
  api: ProcessingJobApi
  /** 鼠标 hover 提示文案。 */
  title?: string
  /** 启动失败时弹窗回调（503 服务未启动、其它 5xx）。父组件可接通用 confirm。 */
  onStartError?: (message: string) => void
}

export function ProcessingJobButton({ label, icon, api, title, onStartError }: Props) {
  const [job, setJob] = useState<ProcessingJob | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  // SSE 订阅 close 函数，组件卸载或任务结束时清理
  const closeRef = useRef<(() => void) | null>(null)

  // 1) 挂载时拉一次最新状态。RUNNING → 立即起 SSE 订阅；DONE/FAILED/CANCELLED → 显示静态结果。
  useEffect(() => {
    let mounted = true
    api.status().then(j => {
      if (!mounted) return
      setJob(j)
      if (j && j.status === 'RUNNING') {
        subscribeProgress()
      }
    }).catch(() => { /* 第一次加载失败不打扰用户 */ })
    return () => {
      mounted = false
      closeRef.current?.()
    }
    // 仅挂载时拉一次；api 引用稳定（buildTaskApi 模块单例）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SSE 订阅：把 progress 事件 merge 进 job 状态；done 时关连接 + 刷新一次 status。
  const subscribeProgress = () => {
    closeRef.current?.()
    closeRef.current = subscribeSse(
      api.eventsPath(),
      {
        onEvent: (event, data) => {
          if (event === 'progress' || event === 'init') {
            // 后端 progress/init payload 就是 ProcessingJob shape
            const view = data as ProcessingJob
            if (view && typeof view === 'object' && 'id' in view) {
              setJob(view)
            }
          } else if (event === 'done') {
            const view = data as ProcessingJob
            if (view && typeof view === 'object' && 'id' in view) {
              setJob(view)
            }
            closeRef.current?.()
            closeRef.current = null
          }
        },
        onError: () => {
          // SSE 断了不报错；下次 effect 或用户点击会重连。
          closeRef.current?.()
          closeRef.current = null
        },
      },
      ['init', 'progress', 'done'],
    )
  }

  const handleStart = async () => {
    if (starting || stopping) return
    setStarting(true)
    try {
      const r = await api.start()
      // 启动成功 → 立即拉一次 status 拿到完整 ProcessingJob，并起 SSE
      const fresh = await api.status()
      setJob(fresh)
      subscribeProgress()
      // 静默使用 r 避免 lint 警告
      void r
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          // 已有 RUNNING：抓 status 接入 SSE 即可（用户体验 = 启动按钮变进度按钮）
          const fresh = await api.status()
          setJob(fresh)
          if (fresh?.status === 'RUNNING') subscribeProgress()
        } else {
          onStartError?.(e.message)
        }
      } else {
        onStartError?.(String(e))
      }
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (stopping) return
    setStopping(true)
    try {
      await api.stop()
      // done 事件会把 status 推成 CANCELLED；这里不做额外动作
    } finally {
      setStopping(false)
    }
  }

  const isRunning = job?.status === 'RUNNING'
  const progressLabel = job && job.total > 0
    ? `${job.processed}/${job.total}`
    : null

  if (isRunning) {
    return (
      <button
        type="button"
        onClick={handleStop}
        disabled={stopping}
        title={title ?? label}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs',
          'border-amber-400/60 bg-amber-400/15 text-amber-700 dark:text-amber-300',
          'hover:bg-amber-400/25 disabled:opacity-50',
        )}
      >
        {stopping ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        {label}
        {progressLabel && (
          <span className="ml-0.5 font-mono tabular-nums">{progressLabel}</span>
        )}
      </button>
    )
  }

  // idle / finished
  const finishedHint = job && job.status !== 'RUNNING' && job.processed > 0
    ? ` · 上次 ${job.succeeded}/${job.total}${job.failed > 0 ? ` (失败 ${job.failed})` : ''}`
    : ''

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={starting}
      title={(title ?? label) + finishedHint}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
    >
      {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon ?? <Play className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

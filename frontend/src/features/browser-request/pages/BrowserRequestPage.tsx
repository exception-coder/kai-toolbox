import { useState } from 'react'
import { Globe } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { SessionList } from '../components/SessionList'
import { RecordingPanel } from '../components/RecordingPanel'
import { TaskListPanel } from '../components/TaskListPanel'
import { TaskCanvasPage } from './TaskCanvasPage'

type Tab = 'record' | 'tasks'

/**
 * 站点录制编排主页 —— 单页路由，用内部 state 切换 4 个视图：
 *   1. 录制屏（默认）：开始/停止录制 + 时间线 + 「用这些调用编排」跳到 canvas
 *   2. 任务列表：所有 task 列表 + 触发回放（用 modal） + 编辑 task 跳到 canvas
 *   3. 编排页（canvas）：从录制派生新建 / 编辑现有 task；保存返回任务列表
 */
export function BrowserRequestPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('record')
  /** canvas 打开状态：null=未打开；{recordingId}=从录制新建；{taskId}=编辑现有 */
  const [canvas, setCanvas] = useState<
    | null
    | { mode: 'create'; recordingId: string }
    | { mode: 'edit'; taskId: string }
  >(null)

  // 切会话时复位
  const handleSelectSession = (id: string | null) => {
    setSessionId(id)
    setCanvas(null)
    setTab('record')
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center gap-2">
        <Globe className="size-5" />
        <h1 className="text-lg font-semibold">站点录制编排</h1>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          浏览器里点一遍 → 自动录 HTTP → 标参数 → 一键回放
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-3">
        <SessionList currentId={sessionId} onSelect={handleSelectSession} />

        <div className="flex min-h-0 flex-col gap-3">
          {!sessionId && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              先在左侧选一个会话，或新建一个。
            </div>
          )}

          {sessionId && canvas && (
            <TaskCanvasPage
              sessionId={sessionId}
              recordingId={canvas.mode === 'create' ? canvas.recordingId : undefined}
              taskId={canvas.mode === 'edit' ? canvas.taskId : undefined}
              onClose={(saved) => {
                setCanvas(null)
                if (saved) setTab('tasks')
              }}
            />
          )}

          {sessionId && !canvas && (
            <>
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'record', label: '录制' },
                  { value: 'tasks', label: '任务 / 回放' },
                ]}
              />
              {tab === 'record' && (
                <RecordingPanel
                  sessionId={sessionId}
                  onComposeFromRecording={(recId) =>
                    setCanvas({ mode: 'create', recordingId: recId })
                  }
                />
              )}
              {tab === 'tasks' && (
                <TaskListPanel
                  sessionId={sessionId}
                  onEdit={(taskId) => setCanvas({ mode: 'edit', taskId })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

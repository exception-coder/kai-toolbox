import { useState } from 'react'
import { Globe } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { SessionList } from '../components/SessionList'
import { LiveScreen } from '../components/LiveScreen'
import { RecordingPanel } from '../components/RecordingPanel'
import { TaskListPanel } from '../components/TaskListPanel'
import { AiFlowPanel } from '../components/AiFlowPanel'
import { TaskCanvasPage } from './TaskCanvasPage'

type Tab = 'record' | 'tasks' | 'ai'

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
    <div className="flex h-full flex-col gap-3 p-2 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Globe className="size-5" />
        <h1 className="text-lg font-semibold">站点录制编排</h1>
        <span className="hidden text-xs text-[var(--color-muted-foreground)] sm:inline">
          浏览器里点一遍 → 自动录 HTTP → 标参数 → 一键回放
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[320px_1fr]">
        {/* 会话列表：移动端选中会话后隐藏（让出全屏给内容），桌面端常驻 */}
        <div className={`min-h-0 overflow-y-auto ${sessionId ? 'hidden md:block' : 'block'}`}>
          <SessionList currentId={sessionId} onSelect={handleSelectSession} />
        </div>

        {/* 内容区：移动端未选会话时隐藏，桌面端显示占位 */}
        <div className={`min-h-0 flex-col gap-3 overflow-y-auto ${sessionId ? 'flex' : 'hidden md:flex'}`}>
          {sessionId && (
            <button
              onClick={() => handleSelectSession(null)}
              className="self-start text-sm text-blue-600 md:hidden dark:text-blue-400"
            >
              ← 返回会话列表
            </button>
          )}
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
              <LiveScreen sessionId={sessionId} />
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'record', label: '录制' },
                  { value: 'tasks', label: '任务 / 回放' },
                  { value: 'ai', label: 'AI 用例' },
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
              {tab === 'ai' && <AiFlowPanel sessionId={sessionId} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

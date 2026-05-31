import { useEffect, useState } from 'react'
import { openReplayStream } from '../api'
import type { StepResultView, TaskRunStatus } from '../types'

export interface ReplayStreamState {
  status: TaskRunStatus | 'IDLE'
  stepCount: number
  stepResults: StepResultView[]
  finishedAt?: number
  errorMessage?: string
  abortedAtStep?: number
  /** 后端写完输出文件后的绝对路径——失败 / 成功都可能有 */
  outputDir?: string
}

/**
 * 订阅一次回放的 SSE 进度。runId 为 null 时不订阅（idle）。
 */
export function useReplayStream(runId: string | null): ReplayStreamState {
  const [state, setState] = useState<ReplayStreamState>({
    status: 'IDLE', stepCount: 0, stepResults: [],
  })

  useEffect(() => {
    if (!runId) {
      setState({ status: 'IDLE', stepCount: 0, stepResults: [] })
      return
    }
    setState({ status: 'RUNNING', stepCount: 0, stepResults: [] })
    const close = openReplayStream(runId, {
      onRunStarted: p => setState(s => ({ ...s, status: 'RUNNING', stepCount: p.stepCount })),
      // run 一开跑就拿到归档路径——前端 UI 立刻能给用户「正在写到这里」的反馈
      onOutputDir: p => setState(s => ({ ...s, outputDir: p.outputDir })),
      onStep: result => setState(s => ({
        ...s,
        // 隐式 fan-out 后同一 stepIndex 会有多条结果，按 (stepIndex, iterationIndex) 共同去重
        stepResults: [
          ...s.stepResults.filter(r =>
            !(r.stepIndex === result.stepIndex
              && (r.iterationIndex ?? null) === (result.iterationIndex ?? null))),
          result,
        ].sort((a, b) =>
          a.stepIndex - b.stepIndex
            || (a.iterationIndex ?? -1) - (b.iterationIndex ?? -1),
        ),
      })),
      onRunDone: p => setState(s => ({
        ...s, status: 'DONE', finishedAt: p.finishedAt, outputDir: p.outputDir ?? s.outputDir,
      })),
      onRunFailed: p => setState(s => ({
        ...s, status: 'FAILED', finishedAt: p.finishedAt,
        errorMessage: p.errorMessage, abortedAtStep: p.abortedAtStep,
        outputDir: p.outputDir ?? s.outputDir,
      })),
    })
    return close
  }, [runId])

  return state
}

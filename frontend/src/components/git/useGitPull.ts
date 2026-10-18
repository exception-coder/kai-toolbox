import { useEffect, useRef, useState } from 'react'
import type { GitPullActions, GitPullPreview } from './types'

/** 检查和写入共用宿主 busy；快照只属于本次所选仓库。 */
export function useGitPull({ actions, repo, onPending, onPulled }: {
  actions?: GitPullActions; repo?: string; onPending: (pending: boolean) => void; onPulled: () => void
}) {
  const callbacks = useRef({ actions, onPending, onPulled })
  callbacks.current = { actions, onPending, onPulled }
  const generation = useRef(0)
  const inFlight = useRef(false)
  const [preview, setPreview] = useState<GitPullPreview | null>(null)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    generation.current++
    setPreview(null)
    setFeedback('')
    return () => { generation.current++ }
  }, [repo])

  async function run(execute: boolean) {
    if (!actions || inFlight.current || (execute && (!preview || preview.pullBlockedReason))) return
    const current = generation.current
    inFlight.current = true
    setPending(true)
    callbacks.current.onPending(true)
    setFeedback('')
    try {
      if (execute && preview) {
        const result = await actions.pull(preview.token, repo)
        if (current !== generation.current) return
        setPreview(null)
        setFeedback(result.message)
        setFailed(false)
        callbacks.current.onPulled()
      } else {
        const result = await actions.prepare(repo)
        if (current !== generation.current) return
        setPreview(result)
        setFailed(false)
      }
    } catch (error) {
      if (current !== generation.current) return
      setPreview(null)
      setFailed(true)
      setFeedback(`${error instanceof Error ? error.message : String(error)}。${execute
        ? '请先核对当前分支及文件状态，再重新检查；不会自动重试。' : '可处理后重新检查；工作文件尚未更新。'}`)
    } finally {
      inFlight.current = false
      setPending(false)
      callbacks.current.onPending(false)
    }
  }

  return { preview, pending, feedback, failed, prepare: () => run(false), pull: () => run(true),
    dismiss: () => setPreview(null) }
}

import { useEffect, useRef, useState } from 'react'
import type { GitPushActions, GitPushPreview } from './types'

/** 推送快照与执行反馈独立于拉取确认，保留已有推送语义。 */
export function useGitPush({ actions, repo, onPending, onPushed }: {
  actions: GitPushActions; repo?: string; onPending: (pending: boolean) => void; onPushed: () => void
}) {
  const callbacks = useRef({ actions, onPending, onPushed })
  callbacks.current = { actions, onPending, onPushed }
  const [preview, setPreview] = useState<GitPushPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [failed, setFailed] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const generation = useRef(0)

  async function refresh() {
    const current = ++generation.current
    setLoading(true)
    setPreview(null)
    setPreviewError('')
    setConfirming(false)
    try {
      const result = await callbacks.current.actions.preview(repo)
      if (current === generation.current) setPreview(result)
    } catch (error) {
      if (current === generation.current) setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }

  useEffect(() => {
    setFeedback('')
    void refresh()
    return () => { generation.current++ }
    // Repository identity owns this preview; callbacks may be recreated by the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  async function push() {
    if (!preview || pending) return
    setPending(true)
    callbacks.current.onPending(true)
    setFeedback('')
    try {
      const result = await callbacks.current.actions.push(preview.token, repo)
      setFailed(false)
      setFeedback(result.message)
      callbacks.current.onPushed()
    } catch (error) {
      setFailed(true)
      setFeedback(`${error instanceof Error ? error.message : String(error)}。请先刷新核对远端状态，再决定重试。`)
    } finally {
      setPending(false)
      callbacks.current.onPending(false)
      await refresh()
    }
  }

  return { preview, loading, pending, confirming, setConfirming, feedback, setFeedback, failed, previewError, refresh, push }
}

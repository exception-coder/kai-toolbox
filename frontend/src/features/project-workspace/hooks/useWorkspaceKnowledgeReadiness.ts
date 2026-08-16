import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ensureKnowledgeBase } from '@/features/claude-chat/public-api'
import { errorMessage } from '../lib/workspaceModel'

let knowledgeEnsureTried = false

/** 每个应用会话只检查一次团队知识库，并暴露可恢复的失败状态。 */
export function useWorkspaceKnowledgeReadiness(
  knowledgeDirExists: boolean | undefined,
  onReady: () => void,
) {
  const mutation = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: result => {
      if (result.status === 'ok' || result.status === 'bound' || result.status === 'cloned') onReady()
    },
  })

  useEffect(() => {
    if (knowledgeEnsureTried) return
    if (knowledgeDirExists === false) {
      knowledgeEnsureTried = true
      mutation.mutate()
    } else if (knowledgeDirExists === true) {
      knowledgeEnsureTried = true
    }
    // mutation identity changes on render; the check is intentionally keyed by readiness only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgeDirExists])

  const failed = !mutation.isPending
    && (mutation.isError || mutation.data?.status === 'error' || mutation.data?.status === 'disabled')

  return {
    mutation,
    failed,
    message: mutation.data?.message || errorMessage(mutation.error),
  }
}

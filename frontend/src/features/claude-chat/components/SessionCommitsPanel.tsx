import { useState } from 'react'
import { CommitsPanel } from '@/components/git/CommitsPanel'
import { SessionProjectDirectoriesDialog } from './SessionProjectDirectoriesDialog'
import { getSessionCommitDiff, getSessionPushPreview, listSessionCommits, listSessionGitRepos, pushSessionCommits } from '../api'

/** 会话关联管理与通用 Git 浏览解耦，保存后重新查询服务端仓库列表。 */
export function SessionCommitsPanel({ sessionId, primaryCwd, onClose, restoreFocus, onDirectoriesChanged }: {
  sessionId: string
  primaryCwd: string
  onClose: () => void
  restoreFocus?: () => void
  onDirectoriesChanged?: (paths: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string>()
  if (editing) return <SessionProjectDirectoriesDialog sessionId={sessionId} primaryCwd={primaryCwd}
    onChanged={paths => onDirectoriesChanged?.(paths)} onClose={() => setEditing(false)} />
  return <CommitsPanel title="会话工作目录" initialRepo={selectedRepo} onRepoChange={setSelectedRepo}
    fetchRepos={() => listSessionGitRepos(sessionId)}
    fetchCommits={repo => listSessionCommits(sessionId, 50, repo).then(result => result.commits)}
    fetchDiff={(hash, repo) => getSessionCommitDiff(sessionId, hash, repo)}
    pushActions={{ preview: repo => getSessionPushPreview(sessionId, repo), push: (token, repo) => pushSessionCommits(sessionId, token, repo) }}
    onManageRepos={primaryCwd ? () => setEditing(true) : undefined}
    restoreFocus={restoreFocus} onClose={onClose} />
}

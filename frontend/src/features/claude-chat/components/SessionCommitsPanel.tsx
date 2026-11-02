import { CommitsPanel } from '@/components/git/CommitsPanel'
import { fetchSessionGitStatus, fetchSessionGitFileDiff, compareSessionGitBranches } from '../api'
import { getSessionCommitDiff, getSessionPushPreview, listSessionCommits, listSessionGitRepos, listSessionGitBranches, pushSessionCommits, prepareSessionPull, pullSessionCommits, getSessionGitWorkspace, prepareSessionBranchSwitch, switchSessionBranch } from '../api'

/** 目录关联保留在会话的独立工作区管理入口，Git 面板只操作已关联仓库。 */
export function SessionCommitsPanel({ sessionId, onClose, restoreFocus }: {
  sessionId: string
  primaryCwd: string
  onClose: () => void
  restoreFocus?: () => void
  onDirectoriesChanged?: (paths: string[]) => void
}) {
  return <CommitsPanel key={sessionId} title="代码与分支"
    fetchRepos={() => listSessionGitRepos(sessionId)}
    fetchBranches={repo => listSessionGitBranches(sessionId, repo)}
    pageSize={100}
    fetchCommits={(repo, branch, offset, head) => (offset ? listSessionCommits(sessionId, 100, repo, branch, offset, head) : listSessionCommits(sessionId, 100, repo, branch)).then(result => result.commits)}
    fetchDiff={(hash, repo) => getSessionCommitDiff(sessionId, hash, repo)}
    fetchStatus={repo => fetchSessionGitStatus(sessionId, repo)}
    fetchFileDiff={(path, x, repo) => fetchSessionGitFileDiff(sessionId, path, x, repo)}
    workspaceActions={{ status: (repo, refresh) => getSessionGitWorkspace(sessionId, repo, refresh),
      compareBranches: (baseRef, ref, repo) => compareSessionGitBranches(sessionId, baseRef, ref, repo),
      prepareSwitch: (ref, repo) => prepareSessionBranchSwitch(sessionId, ref, repo),
      switchBranch: (ref, token, repo) => switchSessionBranch(sessionId, ref, token, repo) }}
    pushActions={{ preview: repo => getSessionPushPreview(sessionId, repo), push: (token, repo) => pushSessionCommits(sessionId, token, repo) }}
    pullActions={{ prepare: repo => prepareSessionPull(sessionId, repo), pull: (token, repo) => pullSessionCommits(sessionId, token, repo) }}
    restoreFocus={restoreFocus} onClose={onClose} />
}

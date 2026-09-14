import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GitWorkspace } from './api'

import { GitChangeTree } from './GitChangeTree'

export function GitWorkspaceChanges({ workspace }: { workspace: GitWorkspace }) {
  const [tab, setTab] = useState<'files' | 'commits'>('files')
  return <section className="min-w-0">
    <nav aria-label="Git 变更类型" className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3">
      <Button size="sm" variant={tab === 'files' ? 'secondary' : 'ghost'} aria-pressed={tab === 'files'} onClick={() => setTab('files')}>待 Commit · {workspace.files.length}</Button>
      <Button size="sm" variant={tab === 'commits' ? 'secondary' : 'ghost'} aria-pressed={tab === 'commits'} onClick={() => setTab('commits')}>待 Push · {workspace.ahead ?? '—'}</Button>
    </nav>
    {tab === 'files' ? <>
      <p className="py-4 text-xs text-[var(--color-muted-foreground)]">显示暂存区与工作树的状态；未跟踪目录合并展示。Push 仅发送已提交的内容。</p>
      {workspace.files.length === 0 ? <p className="py-6 text-sm">工作区干净，没有待提交文件。</p> :
        <GitChangeTree files={workspace.files} />}
    </> : <>
      <p className="py-4 text-xs text-[var(--color-muted-foreground)]">相对于本地保存的上游记录。{workspace.commits.length < (workspace.ahead ?? 0) && `共 ${workspace.ahead} 条，仅展示最近 ${workspace.commits.length} 条。`}</p>
      {workspace.commits.length === 0 ? <p className="py-6 text-sm">{workspace.ahead === null ? '配置有效上游后可查看待推送提交。' : '没有待推送提交。'}</p> :
        <ol className="divide-y divide-[var(--color-border)]">{workspace.commits.map(commit => <li key={commit.hash} className="space-y-2 py-4">
          <p className="break-words text-sm font-medium">{commit.subject}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]"><code title={commit.hash}>{commit.hash.slice(0, 8)}</code><span>{commit.author}</span><time dateTime={commit.date}>{new Date(commit.date).toLocaleString()}</time></p>
        </li>)}</ol>}
    </>}
  </section>
}

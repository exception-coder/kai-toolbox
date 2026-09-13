import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GitWorkspace } from './api'

const statusLabels: Record<string, string> = {
  M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', U: '冲突', T: '类型变化', '?': '未跟踪',
}
const label = (status: string) => statusLabels[status] ?? status.trim()

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
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--color-muted-foreground)]"><tr><th className="pb-3 font-medium">文件路径</th><th className="w-20 pb-3 font-medium">暂存区</th><th className="w-20 pb-3 font-medium">工作树</th></tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">{workspace.files.map(file => <tr key={file.path}>
            <td className="min-w-40 break-all py-3 pr-4 font-mono text-xs"><span className="whitespace-pre-wrap">{file.path}</span>{file.origPath && <span className="mt-1 block text-[var(--color-muted-foreground)]">原路径：{file.origPath}</span>}</td>
            <td className="whitespace-nowrap py-3 pr-3 text-xs">{file.x === '?' ? '—' : label(file.x) || '—'}</td>
            <td className="whitespace-nowrap py-3 text-xs">{label(file.y) || '—'}</td>
          </tr>)}</tbody>
        </table></div>}
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

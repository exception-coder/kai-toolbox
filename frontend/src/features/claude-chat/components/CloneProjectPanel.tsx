import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cloneProject, listWorkspaces } from '../api'

interface Props {
  /** 克隆成功后回调，参数为落地绝对路径（用于设为新会话 cwd）。 */
  onCloned: (path: string) => void
  /** 关闭面板。 */
  onClose: () => void
}

/**
 * 拉取新项目到工作区：填 git 远端地址 + 选工作区根（与新建会话工作区一致）→ git clone 落地。
 * 成功后回填新建会话 cwd；工作区下拉随即刷新出现该项目。
 */
export function CloneProjectPanel({ onCloned, onClose }: Props) {
  const qc = useQueryClient()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })
  const roots = (workspaces?.roots ?? []).filter(r => r.exists)
  const [url, setUrl] = useState('')
  const [root, setRoot] = useState('')

  // 默认选第一个可用工作区根
  useEffect(() => {
    if (!root && roots.length > 0) setRoot(roots[0].root)
  }, [roots, root])

  const mut = useMutation({
    mutationFn: () => cloneProject(url.trim(), root),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['claude-chat-workspaces'] }) // 新项目出现在工作区下拉
      onCloned(res.path)
    },
  })

  const canClone = url.trim().length > 0 && root.length > 0 && !mut.isPending

  return (
    <div className="border-b px-3 py-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">拉取项目到工作区</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      <label className="text-xs text-[var(--color-muted-foreground)]">git 远端地址</label>
      <Input
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canClone) mut.mutate() }}
        placeholder="https://github.com/owner/repo.git"
        className="mt-1"
      />

      <label className="mt-3 block text-xs text-[var(--color-muted-foreground)]">克隆到工作区（与新建会话一致）</label>
      {roots.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">未配置可用工作区根（toolbox.claude-chat.workspace.roots）。</p>
      ) : (
        <select
          value={root}
          onChange={e => setRoot(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          {roots.map(r => <option key={r.root} value={r.root}>{r.root}</option>)}
        </select>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={!canClone} onClick={() => mut.mutate()}>
          {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
          {mut.isPending ? '克隆中…（首次私有仓可能需登录凭据）' : '克隆'}
        </Button>
        {mut.isError && (
          <span className="min-w-0 flex-1 break-words text-xs text-[var(--color-destructive)]">
            {mut.error instanceof Error ? mut.error.message : '克隆失败'}
          </span>
        )}
        {mut.isSuccess && !mut.isPending && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ 已克隆，已带入新建会话</span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">
        用本机 git 凭据克隆（私有仓首次会按 git 配置弹登录 / 用缓存）。失败会显示 git 输出。
      </p>
    </div>
  )
}

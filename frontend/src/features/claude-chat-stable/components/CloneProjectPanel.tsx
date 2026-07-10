import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, GitBranch, Loader2, XCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cloneProject, listWorkspaces } from '../api'

interface Props {
  /** 全部克隆结束后回调，参数为第一个成功项的落地绝对路径（带入新建会话 cwd）。无成功则不调用。 */
  onCloned: (path: string) => void
  /** 关闭面板。 */
  onClose: () => void
}

type RowState = 'pending' | 'cloning' | 'done' | 'error'
interface Row { url: string; state: RowState; message?: string; path?: string }

/** 文本域内容解析为去重后的地址列表：按行拆，去空白、忽略 # 注释行，保序去重。 */
function parseUrls(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const u = raw.trim()
    if (!u || u.startsWith('#')) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

/**
 * 拉取新项目到工作区:文本域每行一个 git 地址,可一次拉多个 → 选工作区根 → 串行 git clone。
 * 串行而非并发:避免多个 clone 同时弹凭据/抢带宽,且失败逐条隔离(一个失败不影响其余)。
 * 全部结束后把第一个成功项带入新建会话 cwd;工作区下拉随即刷新出现这些项目。
 */
export function CloneProjectPanel({ onCloned, onClose }: Props) {
  const qc = useQueryClient()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })
  const roots = (workspaces?.roots ?? []).filter(r => r.exists)
  const [text, setText] = useState('')
  const [root, setRoot] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)

  // 默认选第一个可用工作区根
  useEffect(() => {
    if (!root && roots.length > 0) setRoot(roots[0].root)
  }, [roots, root])

  const urls = useMemo(() => parseUrls(text), [text])
  const canClone = urls.length > 0 && root.length > 0 && !running
  const doneCount = rows.filter(r => r.state === 'done' || r.state === 'error').length

  const run = async () => {
    if (!canClone) return
    setRunning(true)
    let init: Row[] = urls.map(url => ({ url, state: 'pending' as RowState }))
    setRows(init)
    let firstOk: string | null = null
    for (let i = 0; i < init.length; i++) {
      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'cloning' } : r))
      try {
        const res = await cloneProject(init[i].url, root)
        if (!firstOk) firstOk = res.path
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'done', path: res.path, message: res.name } : r))
      } catch (e) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'error', message: e instanceof Error ? e.message : '克隆失败' } : r))
      }
    }
    qc.invalidateQueries({ queryKey: ['claude-chat-workspaces'] }) // 新项目出现在工作区下拉
    setRunning(false)
    if (firstOk) onCloned(firstOk) // 第一个成功项带入新建会话
  }

  return (
    <div className="border-b px-3 py-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">拉取项目到工作区</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      <label className="text-xs text-[var(--color-muted-foreground)]">git 远端地址（每行一个，可一次拉多个）</label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={'https://github.com/owner/repo-a.git\nhttps://github.com/owner/repo-b.git\ngit@github.com:owner/repo-c.git'}
        className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-2 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      />
      {urls.length > 0 && (
        <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">共 {urls.length} 个地址</p>
      )}

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

      {rows.length > 0 && (
        <ul className="mt-3 space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs">
              <span className="mt-0.5 shrink-0">
                {r.state === 'cloning' && <Loader2 className="size-3.5 animate-spin text-[var(--color-primary)]" />}
                {r.state === 'done' && <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
                {r.state === 'error' && <XCircle className="size-3.5 text-[var(--color-destructive)]" />}
                {r.state === 'pending' && <span className="block size-3.5 rounded-full border" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono">{r.url}</span>
                {r.message && (
                  <span className={'block break-words ' + (r.state === 'error' ? 'text-[var(--color-destructive)]' : 'text-emerald-600 dark:text-emerald-400')}>
                    {r.state === 'done' ? `✓ ${r.message}` : r.message}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={!canClone} onClick={run}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
          {running ? `克隆中… ${doneCount}/${rows.length}` : urls.length > 1 ? `克隆 ${urls.length} 个` : '克隆'}
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">
        串行拉取，用本机 git 凭据（私有仓首次会按 git 配置弹登录 / 用缓存）。逐条显示结果，单个失败不影响其余。
      </p>
    </div>
  )
}

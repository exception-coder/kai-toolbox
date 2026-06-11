import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, FolderOpen, GitBranch, GitCommit } from 'lucide-react'
import { openInExplorer } from '../api'
import type { ProjectInfo } from '../types'
import { ProjectTypeBadge } from './ProjectTypeBadge'
import { CommitsPanel } from './CommitsPanel'

interface Props {
  project: ProjectInfo
}

export function ProjectCard({ project }: Props) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [openMsg, setOpenMsg] = useState<string | null>(null)
  const [showCommits, setShowCommits] = useState(false)

  const goTerminal = () => {
    const qs = new URLSearchParams({ cwd: project.path, autorun: 'claude' })
    navigate(`/tools/webterm?${qs.toString()}`)
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  const handleCopy = async (e: React.MouseEvent) => {
    stop(e)
    try {
      await navigator.clipboard.writeText(project.path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setOpenMsg('复制失败：浏览器不允许写入剪贴板')
      setTimeout(() => setOpenMsg(null), 2500)
    }
  }

  const handleOpenInExplorer = async (e: React.MouseEvent) => {
    stop(e)
    try {
      await openInExplorer(project.path)
    } catch (err) {
      setOpenMsg(err instanceof Error ? err.message : String(err))
      setTimeout(() => setOpenMsg(null), 2500)
    }
  }

  return (
    <div
      onClick={goTerminal}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goTerminal()
        }
      }}
      role="button"
      tabIndex={0}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-[var(--color-card)] p-3 text-left shadow-sm transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{project.name}</span>
        <ProjectTypeBadge type={project.type} />
      </div>

      <div className="break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">
        {project.path}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1 truncate">
          {project.branch && (
            <>
              <GitBranch className="size-3" />
              {project.branch}
            </>
          )}
        </span>
        <span className="shrink-0">{formatTime(project.lastModified)}</span>
      </div>

      <div className="flex items-center gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={e => { stop(e); goTerminal() }}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent)]"
          title="在 Web 终端打开并启动 claude"
        >
          <ExternalLink className="size-3" />
          终端 + claude
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent)]"
          title="复制项目绝对路径"
        >
          <Copy className="size-3" />
          {copied ? '已复制' : '复制路径'}
        </button>
        <button
          type="button"
          onClick={handleOpenInExplorer}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent)]"
          title="在文件管理器中打开"
        >
          <FolderOpen className="size-3" />
          文件管理器
        </button>
        {project.branch && (
          <button
            type="button"
            onClick={e => { stop(e); setShowCommits(true) }}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent)]"
            title="查看最近提交与变更差异"
          >
            <GitCommit className="size-3" />
            提交记录
          </button>
        )}
      </div>

      {showCommits && (
        <CommitsPanel project={project} onClose={() => setShowCommits(false)} />
      )}

      {openMsg && (
        <div className="absolute inset-x-2 bottom-2 rounded-md bg-[var(--color-destructive)] px-2 py-1 text-[11px] text-[var(--color-destructive-foreground)]">
          {openMsg}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

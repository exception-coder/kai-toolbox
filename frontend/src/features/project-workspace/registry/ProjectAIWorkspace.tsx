import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listSessions, sessionDisplayName } from '@/features/claude-chat/public-api'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/public-api/runtime'
import { ProjectWorkspacePage } from '../pages/ProjectWorkspacePage'
import { isWithinProject, type ProjectScope } from '../lib/projectScope'
import { RegistryError } from './RegistryStates'

export function ProjectAIWorkspace({ scope }: { scope: ProjectScope }) {
  const navigate = useNavigate()
  const { chat, activate } = useChatRuntime()
  const [pending, setPending] = useState<{ sessionId?: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const sessions = useQuery({ queryKey: ['claude-chat-sessions'], queryFn: listSessions, staleTime: 5000 })
  const related = (sessions.data ?? []).filter(session => isWithinProject(session.cwd, scope.path))

  useEffect(() => {
    if (!pending || !chat) return
    if (pending.sessionId) chat.switchTo(pending.sessionId)
    else chat.open(scope.path)
    setPending(null)
    navigate(CHAT_ROUTE)
  }, [chat, pending, scope.path, navigate])

  const open = (sessionId?: string) => { setPending({ sessionId }); activate() }
  return <div className="min-w-0 space-y-8">
    <section className="space-y-4 border-b border-[var(--color-border)] pb-6" aria-label="项目会话">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">开始项目工作</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">从项目根目录开始，或继续已有会话。初始化可随时在概览中补齐。</p></div>
        <Button onClick={() => open()} disabled={pending !== null}><MessageSquarePlus className="size-4" />新建项目会话</Button>
      </div>
      <RegistryError error={sessions.error} retry={() => void sessions.refetch()} />
      {sessions.isLoading ? <p role="status" className="text-sm">正在读取项目会话…</p> : related.length ? <>
        <div className="divide-y divide-[var(--color-border)]">{(expanded ? related : related.slice(0, 5)).map(session => <button key={session.id} type="button" disabled={pending !== null} onClick={() => open(session.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">
          <span className="min-w-0 break-words font-medium">{sessionDisplayName(session)}</span><span className="max-w-full break-all text-xs text-[var(--color-muted-foreground)]">{session.cwd}</span>
        </button>)}</div>
        {related.length > 5 && <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? '收起会话' : `查看全部 ${related.length} 个会话`}</Button>}
      </> : !sessions.isError && <p className="text-sm text-[var(--color-muted-foreground)]">还没有项目会话，可以直接开始，无需等待初始化。</p>}
    </section>
    <ProjectWorkspacePage scope={scope} onOpenDirectorySettings={() => navigate('/tools/project-workspace?section=directories')} />
  </div>
}

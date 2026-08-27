import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, RefreshCw, Rocket, Unlink, Wrench, X } from 'lucide-react'
import { loadCodexHomePreference, saveCodexHomePreference } from '@/features/claude-chat/public-api'
import { getDevelopmentAccess } from '@/features/reqpool/public-api'
import { unlinkDevSession } from '@/features/prd-clarify/api'
import { buildLaunchIntentRoute, createLaunchIntent, failLaunchIntent } from '@/shell/launch-intent/api'
import { buildDevelopmentHandoff } from '../lib/developmentHandoff'

type DevelopmentEngine = 'claude' | 'codex'

export interface StartDevelopmentDialogProps {
  title: string
  sessionId: string
  projectName: string | null
  content: string
  devDocContent?: string
  existingDevSessionId?: string | null
  initialEngine?: DevelopmentEngine
  onClose: () => void
}

async function resolveWorkspace(projectName: string | null) {
  const primaryProjectName = projectName?.split(/[,，、]/)[0]?.trim() ?? ''
  if (!primaryProjectName) return ''
  try {
    const res = await fetch('/api/claude-chat/workspaces', {
      headers: { Authorization: `Bearer ${localStorage.getItem('toolbox.auth.token') ?? ''}` },
    })
    if (!res.ok) return ''
    const data = await res.json() as { roots: Array<{ dirs?: Array<{ name: string; path: string }> }> }
    for (const root of data.roots ?? []) {
      const found = root.dirs?.find(dir => dir.name === primaryProjectName)
      if (found) return found.path
    }
  } catch { /* 工作目录无法自动匹配时由用户在工作台选择。 */ }
  return ''
}

/** PRD 页面与需求中枢代码节点共用的开发会话入口。 */
export function StartDevelopmentDialog({
  title,
  sessionId,
  projectName,
  content,
  devDocContent,
  existingDevSessionId,
  initialEngine = 'codex',
  onClose,
}: StartDevelopmentDialogProps) {
  const navigate = useNavigate()
  const [engine, setEngine] = useState<DevelopmentEngine>(initialEngine)
  const [codexHome, setCodexHome] = useState(loadCodexHomePreference)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const hasDevDoc = !!devDocContent?.trim()

  const launch = async () => {
    if (launching) return
    setLaunching(true)
    setError('')
    try {
      const access = await getDevelopmentAccess(sessionId)
      const linkedSessionId = access.devSessionId || existingDevSessionId
      if (linkedSessionId && !replaceExisting) {
        navigate(`/tools/claude-chat?sessionId=${encodeURIComponent(linkedSessionId)}&prdSessionId=${encodeURIComponent(sessionId)}`)
        onClose()
        return
      }
      const cwd = await resolveWorkspace(projectName)
      const payload = {
        type: 'CHAT_OPEN_AND_SEND',
        cwd,
        seed: buildDevelopmentHandoff({ title, sessionId, content, devDocContent }),
        prdSessionId: sessionId,
        engine,
        codexHome: engine === 'codex' ? (codexHome.trim() || undefined) : undefined,
      } as const
      const intent = await createLaunchIntent(payload)
      if (replaceExisting && linkedSessionId) {
        try {
          await unlinkDevSession(sessionId)
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '解除原开发会话绑定失败'
          try { await failLaunchIntent(intent.id, message) } catch { /* 原错误优先展示。 */ }
          throw cause
        }
      }
      if (engine === 'codex') saveCodexHomePreference(codexHome)
      navigate(buildLaunchIntentRoute('/tools/claude-chat', intent.id, payload))
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法发起开发会话')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4" onMouseDown={event => event.target === event.currentTarget && !launching && onClose()}>
      <section className="max-h-full w-full overflow-y-auto border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2"><Rocket className="h-4 w-4 shrink-0 text-green-500" /><span className="truncate text-sm font-semibold">{existingDevSessionId ? (replaceExisting ? '重新绑定开发会话' : '继续开发') : '发起 Vibe Coding'} — {title}</span></div>
          <button type="button" disabled={launching} onClick={onClose} className="text-[var(--color-muted-foreground)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 px-5 py-4">
          {existingDevSessionId && !replaceExisting ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-300">该规格已绑定开发会话，将直接回到原会话继续开发。</div>
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="text-xs font-medium">需要重新开始开发会话？</div>
                <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">可以解除当前绑定，选择 Code 引擎后新建会话；原会话及聊天记录仍保留，但不再关联此规格和执行计划。</p>
                <button type="button" disabled={launching} onClick={() => { setReplaceExisting(true); setError('') }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-500/15 dark:text-amber-300"><RefreshCw className="h-4 w-4" />重新绑定并开启新会话</button>
              </div>
            </div>
          ) : (
            <>
              {existingDevSessionId && <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300"><Unlink className="mt-0.5 h-4 w-4 shrink-0" /><span>启动时会先解除原开发会话的绑定，再创建并绑定新会话。原会话内容不会删除。</span></div>}
              <div><label className="mb-2 block text-sm font-medium">开发引擎</label><div className="grid grid-cols-2 gap-2">{([['codex', 'Codex'], ['claude', 'Claude Code']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setEngine(value)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${engine === value ? 'border-green-500/50 bg-green-500/10 text-green-600' : 'border-[var(--color-border)]'}`}>{label}</button>)}</div></div>
              {engine === 'codex' && <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3"><label htmlFor="requirement-dev-codex-home" className="mb-1.5 block text-xs font-medium">Codex Auth 目录</label><input id="requirement-dev-codex-home" value={codexHome} onChange={event => setCodexHome(event.target.value)} placeholder="%USERPROFILE%\.codex-account-yx" className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2.5 text-sm outline-none" /></div>}
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${hasDevDoc ? 'border-purple-500/20 bg-purple-500/10 text-purple-500' : 'border-amber-500/20 bg-amber-500/10 text-amber-600'}`}>{hasDevDoc ? <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{hasDevDoc ? '将同时绑定核心规格与执行计划，直接从实现阶段开始。' : '当前没有执行计划，将携带核心规格从代码探索与技术方案阶段开始。'}</span></div>
              <ol className="space-y-2 text-xs leading-5 text-[var(--color-muted-foreground)]"><li>1. 自动匹配项目工作目录</li><li>2. 新建会话并发送规格开发交接</li><li>3. 会话 ID 自动回写并绑定当前规格与执行计划</li></ol>
            </>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4">
          {existingDevSessionId && replaceExisting && <button type="button" disabled={launching} onClick={() => { setReplaceExisting(false); setError('') }} className="mr-auto rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm">返回</button>}
          <button type="button" disabled={launching} onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm">取消</button>
          <button type="button" disabled={launching} onClick={() => void launch()} className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${replaceExisting ? 'bg-amber-600' : 'bg-green-600'}`}>{launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{existingDevSessionId ? (replaceExisting ? '解除旧绑定并启动' : '打开原会话') : '启动开发会话'}</button>
        </footer>
      </section>
    </div>
  )
}

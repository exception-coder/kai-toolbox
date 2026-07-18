import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Hammer, Loader2, MessageCircleQuestion, Send, Wrench, X } from 'lucide-react'
import { featureAtPath } from '@/shell/featureRegistry'
import { isChatRoute, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { getSelfRepo } from '../api'

type Panel = 'module' | 'project' | null

/** 拼装「改当前模块」投喂给 Vibe Coding 的轻量触发语：只走「定位确认→改码→出 diff」三步，不强制方案确认环节。 */
function buildModuleSeed(moduleLabel: string, codePath: string, ask: string): string {
  return [
    `在 kai-toolbox 仓修一个小点（工作台自维护，模块：${moduleLabel}）。`,
    `代码位置：${codePath}`,
    '问题/诉求：',
    ask.trim(),
    '',
    '轻量流程：先读代码定位改动点念给我确认 → 直接改码 → 自检出 diff 给我看，不需要额外的方案确认环节。',
  ].join('\n')
}

/** 拼装「问项目」投喂语：不锁模块，先读仓库约定文档再回答/评估。 */
function buildProjectSeed(ask: string): string {
  return [
    '关于 kai-toolbox 仓的问题（不锁定具体模块，工作台自维护）：',
    ask.trim(),
    '',
    '先读 CLAUDE.md 和 docs/design/architecture.md 了解仓库约定，再回答/评估/建议；如涉及改码，改完给我出 diff 自检。',
  ].join('\n')
}

/**
 * 「Forge 自修机器人」常驻触发器：右下角悬浮小锤子图标，点开分裂出「改这个模块」/「问项目」两个入口，
 * 分别在左上角/右上角弹出迷你输入框——左手锁定当前打开的模块，右手面向整个仓库不锁模块。
 * 提交后转交给同一个 Vibe Coding 悬浮窗实例处理（不新开一套聊天 UI），cwd 固定为后端配置的自身仓库路径。
 * 仅在配置了 {@code toolbox.claude-chat.workspace.self-repo-path} 且目录存在时出现。
 */
export function ForgeBotTrigger() {
  const location = useLocation()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()
  const { data: selfRepo } = useQuery({ queryKey: ['claude-chat-self-repo'], queryFn: getSelfRepo, staleTime: 60000 })

  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [moduleDraft, setModuleDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const pendingRef = useRef<{ cwd: string; seed: string } | null>(null)

  const feature = featureAtPath(location.pathname)

  // chat 从 null 变为可用（懒启动完成）时，把排队的一次性投喂发出去。
  const deliver = useCallback(() => {
    const p = pendingRef.current
    if (!chat || !p) return
    pendingRef.current = null
    chat.open(p.cwd)
    chat.send(p.seed)
    setFloating(true)
    setMinimized(false)
  }, [chat, setFloating, setMinimized])
  useEffect(() => { if (chat && pendingRef.current) deliver() }, [chat, deliver])

  if (!selfRepo?.exists || isChatRoute(location.pathname)) return null

  const queue = (seed: string) => {
    pendingRef.current = { cwd: selfRepo.path, seed }
    if (chat) deliver(); else activate()
    setPanel(null)
    setMenuOpen(false)
  }

  const submitModule = () => {
    const ask = moduleDraft.trim()
    if (!ask || !feature) return
    const codePath = `frontend/src/features/${feature.id}（如有对应后端模块，一并检查 tools/tool-${feature.id}）`
    queue(buildModuleSeed(feature.name, codePath, ask))
    setModuleDraft('')
  }
  const submitProject = () => {
    const ask = projectDraft.trim()
    if (!ask) return
    queue(buildProjectSeed(ask))
    setProjectDraft('')
  }

  return (
    <>
      {/* 主图标：右下角常驻，点击展开/收起两个分裂入口 */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="flex flex-col items-end gap-2 transition-all">
            <button
              type="button"
              onClick={() => setPanel('project')}
              title="不锁定模块，面向整个 kai-toolbox 仓库提问/建议"
              className="flex items-center gap-1.5 rounded-full border bg-[var(--color-card)] px-3 py-1.5 text-xs shadow-md transition hover:border-[var(--color-primary)]"
            >
              <MessageCircleQuestion className="size-3.5" />问项目
            </button>
            <button
              type="button"
              onClick={() => feature && setPanel('module')}
              disabled={!feature}
              title={feature ? `就地对「${feature.name}」发起小修` : '当前页面不属于具体模块，试试「问项目」'}
              className="flex items-center gap-1.5 rounded-full border bg-[var(--color-card)] px-3 py-1.5 text-xs shadow-md transition hover:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wrench className="size-3.5" />改这个模块
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Forge 自修机器人"
          title="Forge 自修机器人：改当前模块 / 问项目"
          className={`flex size-11 items-center justify-center rounded-full text-[var(--color-primary-foreground)] shadow-lg transition-transform hover:scale-105 active:scale-95 ${menuOpen ? 'bg-[var(--color-foreground)]' : 'bg-[var(--color-primary)]'}`}
        >
          {menuOpen ? <X className="size-5" /> : <Hammer className="size-5" />}
        </button>
      </div>

      {/* 左手：改当前模块——固定左上角 */}
      {panel === 'module' && feature && (
        <MiniPanel
          corner="left"
          icon={<Wrench className="size-4" />}
          title={`改这个模块 · ${feature.name}`}
          hint="按你说的诉求：读码定位确认 → 改码 → 出 diff，转交 Vibe Coding 悬浮窗跟进。"
          value={moduleDraft}
          onChange={setModuleDraft}
          onSubmit={submitModule}
          onClose={() => setPanel(null)}
          placeholder={`「${feature.name}」有什么要修/要改？`}
          busy={!chat && !!pendingRef.current}
        />
      )}

      {/* 右手：问项目——固定右上角，不锁模块 */}
      {panel === 'project' && (
        <MiniPanel
          corner="right"
          icon={<MessageCircleQuestion className="size-4" />}
          title="问项目"
          hint="不锁定模块，面向整个 kai-toolbox 仓库；转交 Vibe Coding 悬浮窗跟进。"
          value={projectDraft}
          onChange={setProjectDraft}
          onSubmit={submitProject}
          onClose={() => setPanel(null)}
          placeholder="想问/想改点什么？"
          busy={!chat && !!pendingRef.current}
        />
      )}
    </>
  )
}

interface MiniPanelProps {
  corner: 'left' | 'right'
  icon: React.ReactNode
  title: string
  hint: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onClose: () => void
  placeholder: string
  busy: boolean
}

/** 迷你输入弹层：不做拖拽/最小化这些重交互（那是 Vibe Coding 主悬浮窗的事），提交后自行收起。 */
function MiniPanel({ corner, icon, title, hint, value, onChange, onSubmit, onClose, placeholder, busy }: MiniPanelProps) {
  return (
    <div
      className={`fixed top-4 z-50 w-[min(320px,calc(100vw-2rem))] rounded-xl border bg-[var(--color-card)] shadow-xl ${corner === 'left' ? 'left-4' : 'right-4'}`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-[var(--color-primary)]">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded p-1 hover:bg-[var(--color-accent)]">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="p-3">
        <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">{hint}</p>
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
          placeholder={placeholder}
          className="w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {busy && <Loader2 className="size-3.5 animate-spin text-[var(--color-muted-foreground)]" />}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            <Send className="size-3.5" />发送
          </button>
        </div>
      </div>
    </div>
  )
}

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

/**
 * 拼装「问项目」投喂语：不锁模块，先读仓库约定文档再回答/评估。
 * 回答对象默认按业务人员对待——直给结论，不主动铺技术细节，用户追问了再展开，
 * 避免把 Vibe Coding 的完整调查过程（文件路径/行号/大段表格）原样倒给一个只想要答案的人。
 */
function buildProjectSeed(ask: string): string {
  return [
    '关于 kai-toolbox 仓的问题（不锁定具体模块，工作台自维护）：',
    ask.trim(),
    '',
    '回答对象是业务人员，不是来读代码的：先给一句话结论，最多再补 2~3 点关键信息就够；',
    '不要主动展开代码片段/文件路径/行号/大段表格这类实现细节，除非我明确追问细节再展开。',
    '需要可以先读 CLAUDE.md 和 docs/design/architecture.md 核对仓库约定，但别把「读了什么」过程复述给我。',
    '如果问题最终要改码，直接改完出 diff 给我看结果，不用先铺一堆方案说明。',
  ].join('\n')
}

/**
 * 「Forge 自修机器人」常驻触发器：右下角悬浮小锤子图标，点开分裂出「改这个模块」/「问项目」两个入口，
 * 分别在左上角/右上角弹出迷你输入框——左手锁定当前打开的模块，右手面向整个仓库不锁模块。
 * 提交后转交给同一个 Vibe Coding 悬浮窗实例处理（不新开一套聊天 UI），cwd 固定为后端配置的自身仓库路径。
 * 仅在配置了 {@code toolbox.claude-chat.workspace.self-repo-path} 且目录存在时出现。
 * 气泡默认只显示你敲的原话，不显示门控提示词模板（send 的 displayText 参数，气泡上有「完整内容」可展开回看）。
 */
export function ForgeBotTrigger() {
  const location = useLocation()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()
  const { data: selfRepo } = useQuery({ queryKey: ['claude-chat-self-repo'], queryFn: getSelfRepo, staleTime: 60000 })

  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [moduleDraft, setModuleDraft] = useState('')
  const [projectDraft, setProjectDraft] = useState('')
  const pendingRef = useRef<{ cwd: string; seed: string; displayText: string } | null>(null)

  const feature = featureAtPath(location.pathname)
  // AI 存在感：ripple/呼吸不只反映本机器人自己发起的任务，而是真实的 chat.running——
  // 只要工作台里有 AI 在干活（哪怕悬浮窗是关着的），orb 都会显出「正在忙」，让它更像一个环境感知的存在，而非一颗按钮。
  const active = !!chat?.running
  const activating = !chat && !!pendingRef.current
  // 待确认权限/提问：需要你回来处理，球体转琥珀色 + 常驻提醒角标（即使收起菜单也看得见）。
  const needsAttention = chat?.pending?.kind === 'permission' || chat?.pending?.kind === 'question'

  // chat 从 null 变为可用（懒启动完成）时，把排队的一次性投喂发出去。
  // displayText：气泡只显示用户在迷你输入框里敲的原话，不显示门控提示词模板——那是「整个 Vibe Coding」
  // 的通用能力（send 的第三个参数），本机器人只是第一个用它的调用方。
  const deliver = useCallback(() => {
    const p = pendingRef.current
    if (!chat || !p) return
    pendingRef.current = null
    chat.open(p.cwd)
    chat.send(p.seed, undefined, p.displayText)
    setFloating(true)
    setMinimized(false)
  }, [chat, setFloating, setMinimized])
  useEffect(() => { if (chat && pendingRef.current) deliver() }, [chat, deliver])

  if (!selfRepo?.exists || isChatRoute(location.pathname)) return null

  const queue = (seed: string, displayText: string) => {
    pendingRef.current = { cwd: selfRepo.path, seed, displayText }
    if (chat) deliver(); else activate()
    setPanel(null)
    setMenuOpen(false)
  }

  const submitModule = () => {
    const ask = moduleDraft.trim()
    if (!ask || !feature) return
    const codePath = `frontend/src/features/${feature.id}（如有对应后端模块，一并检查 tools/tool-${feature.id}）`
    queue(buildModuleSeed(feature.name, codePath, ask), ask)
    setModuleDraft('')
  }
  const submitProject = () => {
    const ask = projectDraft.trim()
    if (!ask) return
    queue(buildProjectSeed(ask), ask)
    setProjectDraft('')
  }

  return (
    <>
      {/* 主图标：右下角常驻的「AI Orb」——不是一个静态按钮，闲置慢呼吸，AI 干活时外圈扩散波纹，
          呼吸/波纹用 --color-primary 走主题色，跟随用户选的主色（详见 index.css 的 orb-* 关键帧）。 */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {menuOpen && (
          <div className="animate-orb-dock-in flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)]/70 bg-[color-mix(in_oklab,var(--color-card)_82%,transparent)] p-1.5 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setPanel('project')}
              title="不锁定模块，面向整个 kai-toolbox 仓库提问/建议"
              className="flex w-44 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)]"
            >
              <MessageCircleQuestion className="size-4 shrink-0 text-[var(--color-primary)]" />问项目
            </button>
            <button
              type="button"
              onClick={() => feature && setPanel('module')}
              disabled={!feature}
              title={feature ? `就地对「${feature.name}」发起小修` : '当前页面不属于具体模块，试试「问项目」'}
              className="flex w-44 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Wrench className="size-4 shrink-0 text-[var(--color-primary)]" />改这个模块
            </button>
          </div>
        )}

        <div className="group relative">
          {/* 环境光晕：闲置慢呼吸，表明「AI 在这，但没事干」 */}
          <span aria-hidden className="absolute inset-0 -z-10 rounded-full opacity-70 blur-lg animate-orb-breathe" style={{ background: 'var(--color-primary)' }} />
          {/* 扩散波纹：真实反映 chat.running（不局限于本机器人自己发起的任务）——工作台里只要 AI 在忙，orb 就会显出来 */}
          {(active || activating) && (
            <>
              <span aria-hidden className="absolute inset-0 -z-10 rounded-full animate-orb-ripple" style={{ background: 'var(--color-primary)' }} />
              <span aria-hidden className="absolute inset-0 -z-10 rounded-full animate-orb-ripple [animation-delay:0.6s]" style={{ background: 'var(--color-primary)' }} />
            </>
          )}
          {/* 悬浮上下文提示：待你确认 / 待命 / 唤醒中 / AI 工作中 / 当前模块名——一眼知道「它此刻知道什么」 */}
          <span className="pointer-events-none absolute -top-9 right-0 whitespace-nowrap rounded-full border bg-[var(--color-popover)] px-2.5 py-1 text-[11px] text-[var(--color-popover-foreground)] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            Forge · {needsAttention ? '待你确认' : active ? 'AI 工作中' : activating ? '唤醒中…' : feature ? feature.name : '待命'}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Forge 自修机器人"
            title={needsAttention ? 'Forge 自修机器人：有待你确认的权限/提问' : 'Forge 自修机器人：改当前模块 / 问项目'}
            className="relative flex size-12 items-center justify-center rounded-full text-[var(--color-primary-foreground)] shadow-[0_10px_28px_-6px_var(--color-primary)] transition-transform hover:scale-105 active:scale-95"
            style={{
              background: needsAttention
                ? 'radial-gradient(circle at 32% 28%, color-mix(in oklab, oklch(0.7 0.14 70) 55%, white 45%), oklch(0.7 0.14 70) 72%)'
                : 'radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--color-primary) 55%, white 45%), var(--color-primary) 72%)',
            }}
          >
            {menuOpen ? <X className="size-5" /> : activating ? <Loader2 className="size-5 animate-spin" /> : <Hammer className="size-5" />}
          </button>
          {/* 待确认权限/提问：常驻提醒角标，收起菜单也看得见——不是「AI 在忙」而是「AI 在等你」 */}
          {needsAttention && !menuOpen && (
            <span className="absolute right-0 top-0 flex size-3">
              <span aria-hidden className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span aria-hidden className="relative inline-flex size-3 rounded-full border-2 border-[var(--color-card)] bg-amber-500" />
            </span>
          )}
        </div>
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
      className={`animate-orb-dock-in fixed top-4 z-50 w-[min(320px,calc(100vw-2rem))] rounded-xl border bg-[color-mix(in_oklab,var(--color-card)_92%,transparent)] shadow-2xl backdrop-blur-xl ${corner === 'left' ? 'left-4' : 'right-4'}`}
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

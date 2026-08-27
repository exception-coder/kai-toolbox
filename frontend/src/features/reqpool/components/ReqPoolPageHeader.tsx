import {
  ChevronDown,
  Database,
  LayoutList,
  Plus,
  Presentation,
  RefreshCw,
  Sparkles,
  Wand2,
  Workflow,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type ReqPoolViewMode = 'table' | 'leader'

/** 需求中枢的页面导航、登记入口与 Vibe Coding 快捷入口。 */
export function ReqPoolPageHeader({
  view,
  entryMenuOpen,
  syncing,
  onViewChange,
  onSync,
  onEntryMenuChange,
  onQuickEntry,
  onStandardEntry,
  onOpenVibe,
}: {
  view: ReqPoolViewMode
  entryMenuOpen: boolean
  syncing: boolean
  onViewChange: (view: ReqPoolViewMode) => void
  onSync: () => void
  onEntryMenuChange: (open: boolean) => void
  onQuickEntry: () => void
  onStandardEntry: () => void
  onOpenVibe: (prompt?: string) => void
}) {
  return <>
    <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"><Sparkles className="h-4 w-4" /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">AI 需求中枢</h1><span className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]" />实时同步</span></div>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">一套标准收口需求，一条证据链还原真实进度</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onSync} disabled={syncing} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-muted)] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />同步证据</button>
          <button onClick={() => onOpenVibe('调整需求中枢当前页面的字段与展示方式：')} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-muted)]"><Wand2 className="h-3.5 w-3.5 text-[var(--color-primary)]" />AI 调整页面</button>
          <div className="relative">
            <button onClick={() => onEntryMenuChange(!entryMenuOpen)} className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90"><Plus className="h-3.5 w-3.5" />登记需求<ChevronDown className={`h-3 w-3 transition-transform ${entryMenuOpen ? 'rotate-180' : ''}`} /></button>
            {entryMenuOpen && <>
              <button aria-label="关闭登记方式菜单" className="fixed inset-0 z-20 cursor-default" onClick={() => onEntryMenuChange(false)} />
               <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-72 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 shadow-lg">
                <EntryChoice icon={<Sparkles className="h-4 w-4" />} title="快速起草" description="选择系统模块，粘贴描述或附件，保存即完成登记" recommended onClick={onQuickEntry} />
                <div className="mx-2 h-px bg-[var(--color-border)]" />
                <EntryChoice icon={<Workflow className="h-4 w-4" />} title="标准模式" description="进入完整需求规格流程，由 AI 澄清业务规则与验收标准" onClick={onStandardEntry} />
              </div>
            </>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto px-5 lg:px-8">
        <ViewTab active={view === 'table'} icon={<LayoutList className="h-3.5 w-3.5" />} label="统一工作台" onClick={() => onViewChange('table')} />
        <ViewTab active={view === 'leader'} icon={<Presentation className="h-3.5 w-3.5" />} label="领导视图" onClick={() => onViewChange('leader')} />
        <div className="ml-auto hidden items-center gap-2 pb-2 text-[10px] text-[var(--color-muted-foreground)] sm:flex"><Database className="h-3 w-3" />需求规格 · 执行方案 · Git · 文档已连接</div>
      </div>
    </header>

  </>
}

function EntryChoice({ icon, title, description, recommended, onClick }: { icon: ReactNode; title: string; description: string; recommended?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-[var(--color-muted)]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)]">{icon}</span><span><span className="flex items-center gap-2 text-xs font-semibold">{title}{recommended && <span className="text-[9px] font-normal text-[var(--color-muted-foreground)]">推荐</span>}</span><span className="mt-1 block text-[10px] leading-4 text-[var(--color-muted-foreground)]">{description}</span></span></button>
}

function ViewTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${active ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-muted-foreground)]'}`}>{icon}{label}</button>
}

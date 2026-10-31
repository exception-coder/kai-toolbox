import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Plus, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { getSystemWorkspaceDisplayName } from '@/lib/systemCatalog'
import type { Engine, WorkspaceList } from '../types'
import type { NewSessionPreferences } from '../lib/newSessionPreferences'
import { engineName } from './chatStatus'
import { workspaceName } from '../lib/newSessionWorkspace'

const WorkspaceSettings = lazy(() => import('./NewSessionWorkspaceSettings').then(module => ({ default: module.NewSessionWorkspaceSettings })))

interface Props {
  choice: NewSessionPreferences
  roots: WorkspaceList['roots']
  root: WorkspaceList['roots'][number] | null
  project: string
  engines: Engine[]
  recent: NewSessionPreferences | null
  recentIssue?: string
  issue?: string
  warning?: string
  loading: boolean
  creating: boolean
  providerLabel?: string
  onSelect: (change: Partial<NewSessionPreferences>) => void
  onCreate: (choice?: NewSessionPreferences) => void
  onClose: () => void
  onReload: () => void
  onEngines: () => void
  onAggregate: () => void
  children: ReactNode
}

export function NewSessionPanel({ choice, roots, root, project, engines, recent, recentIssue, issue, warning,
  loading, creating, providerLabel, onSelect, onCreate, onClose, onReload, onEngines, onAggregate, children }: Props) {
  const [settings, setSettings] = useState<'create' | 'settings' | null>(null)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const createTrigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const primaryEngines = (['codex', 'claude', 'qwen'] as Engine[]).filter(engine => engines.includes(engine))
  for (const engine of engines) if (primaryEngines.length < 3 && !primaryEngines.includes(engine)) primaryEngines.push(engine)
  const remainingEngines = engines.filter(engine => !primaryEngines.includes(engine))
  const closeSettings = () => {
    const target = settings === 'create' ? createTrigger : settingsTrigger
    setSettings(null)
    requestAnimationFrame(() => target.current?.focus())
  }
  const selectWorkspace = (path: string) => onSelect({ workspaceRoot: path, cwd: path })
  const rootOptions = roots.map(item => {
    const name = workspaceName(item.root)
    const duplicate = roots.filter(candidate => workspaceName(candidate.root) === name).length > 1
    return { value: item.root, label: duplicate ? `${name} · ${item.root}` : name }
  })
  return <section data-guide-location="start" aria-label="新建编程会话" className="flex min-h-0 flex-1 flex-col bg-[var(--color-background)]">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 md:px-8 md:pt-8">
      <div className="mx-auto w-full max-w-xl space-y-5 pb-5">
        <header className="flex items-center justify-between gap-3">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">新建会话</h2>
          <Button variant="ghost" size="icon" aria-label="返回对话" onClick={onClose}><X className="size-4" /></Button>
        </header>
        {recent && <div className="border-b pb-4">
          <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">最近使用</p>
          <button type="button" disabled={loading || creating || !!recentIssue} onClick={() => onCreate(recent)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md bg-[var(--color-muted)]/50 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] disabled:opacity-50"
            aria-label={`按最近配置创建会话：${workspaceName(recent.workspaceRoot)} / ${workspaceName(recent.cwd)}，${engineName(recent.engine)}`}>
            <span className="min-w-0"><span className="block truncate font-medium">{workspaceName(recent.workspaceRoot)}{recent.cwd !== recent.workspaceRoot ? ` / ${workspaceName(recent.cwd)}` : ''}</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">{engineName(recent.engine)}</span></span>
            <span className="flex shrink-0 items-center gap-1 text-xs">直接创建<ArrowRight className="size-3.5" /></span>
          </button>
          {recentIssue && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">最近配置暂不可用，请在下方调整。</p>}
        </div>}
        <div className="space-y-2">
          <label htmlFor="vibe-new-workspace" className="block text-sm font-medium">工作区</label>
          <div className="flex min-w-0 gap-2">
            <Combobox id="vibe-new-workspace" aria-label="工作区" value={root?.root ?? ''} options={rootOptions} searchable allowCustom={false}
              onChange={selectWorkspace} disabled={loading || creating} placeholder={loading ? '正在读取工作区…' : '选择工作区'} className="min-h-11 min-w-0 flex-1" />
            <Button ref={createTrigger} className="min-h-11" variant="outline" disabled={creating} onClick={() => setSettings('create')}><Plus className="size-4" />新建</Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="vibe-coding-project-picker" className="block text-sm font-medium">项目 <span className="font-normal text-[var(--color-muted-foreground)]">· 可选</span></label>
          <Combobox id="vibe-coding-project-picker" className="min-h-11" aria-label="项目" value={project} allowCustom={false} searchable
            options={[{ value: '', label: '不选项目 · 使用工作区' }, ...(root?.dirs.map(item => ({ value: item.path, label: getSystemWorkspaceDisplayName(item) })) ?? [])]}
            onChange={path => onSelect({ cwd: path || root?.root || '' })} disabled={!root || loading || creating} placeholder="不选项目 · 使用工作区" />
          {root && <p className="text-xs text-[var(--color-muted-foreground)]">{project ? `在 ${workspaceName(project)} 中执行` : `未选项目，将在 ${workspaceName(root.root)} 工作区中执行`}</p>}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium" id="vibe-new-engine">编程引擎</p>
          <div role="group" aria-labelledby="vibe-new-engine" className="flex flex-wrap gap-2">
            {primaryEngines.map(engine => <Button key={engine} variant={engine === choice.engine ? 'secondary' : 'outline'}
              className={`min-h-11 ${engine === choice.engine ? 'border border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : ''}`}
              disabled={creating} aria-pressed={engine === choice.engine} onClick={() => onSelect({ engine })}>{engineName(engine)}</Button>)}
            {remainingEngines.length > 0 && <Combobox aria-label="其他引擎" allowCustom={false} value={remainingEngines.includes(choice.engine) ? choice.engine : ''}
              options={remainingEngines.map(engine => ({ value: engine, label: engineName(engine) }))} onChange={value => onSelect({ engine: value as Engine })}
              placeholder="其他引擎" disabled={creating} className="min-h-11 w-36" />}
            {!engines.length && <p className="text-xs text-[var(--color-muted-foreground)]">{loading ? '正在读取可用引擎…' : '暂未确认可用引擎'}</p>}
          </div>
          {providerLabel && <p className="text-xs text-[var(--color-muted-foreground)]">已选服务商：{providerLabel}</p>}
          {!engines.length && !loading && <Button variant="link" size="sm" onClick={() => { setSettings('settings'); onEngines() }}>查看引擎状态</Button>}
        </div>
        {(issue || warning) && <div role="status" className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
          {issue && <p>{issue}</p>}{warning && <p>{warning}</p>}
          {!loading && <button type="button" className="underline" onClick={onReload}>刷新可用配置</button>}
        </div>}
        <Button ref={settingsTrigger} variant="ghost" size="sm" className="min-h-11 px-0 text-[var(--color-muted-foreground)]" onClick={() => setSettings('settings')}><Settings2 className="size-3.5" />工作区与运行设置</Button>
      </div>
    </div>
    <footer className="shrink-0 border-t bg-[var(--color-background)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8">
      <div className="mx-auto w-full max-w-xl"><Button size="lg" disabled={loading || creating || !!issue} onClick={() => onCreate()} className="min-h-11 w-full">{creating ? '正在创建…' : '创建会话'}<ArrowRight className="size-4" /></Button></div>
    </footer>
    {settings && <Suspense fallback={<p role="status" className="px-5 py-2 text-xs">正在打开设置…</p>}>
      <WorkspaceSettings key={settings} mode={settings} cwd={choice.cwd || root?.root || ''} onClose={closeSettings} onSelect={selectWorkspace} onAggregate={() => { setSettings(null); onAggregate() }}>{children}</WorkspaceSettings>
    </Suspense>}
  </section>
}

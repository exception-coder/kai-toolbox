import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FixedCombobox } from '@/components/ui/fixed-combobox'
import { VoiceInputButton } from '@/features/claude-chat/public-api/voice'
import { resolveWeeklyRequest, type Project, type Scope } from '../api'
import { useRememberedProjects } from '../lib/useRememberedProjects'

export function AssistantSetup({ projects, busy, onStart, onPlanningChange, initialInput, onInputChange }: {
  assistant: string; projects: Project[]; busy: boolean;
  onStart: (engine: string, model: string, scope: Scope, input: string) => Promise<void>
  onPlanningChange?: (value: boolean) => void
  initialInput?: string; onInputChange?: (value: string) => void
}) {
  const [engine, setEngine] = useState('codex'), [model, setModel] = useState('')
  const [projectIds, setProjects] = useRememberedProjects('weekly', projects.map(project => project.id))
  const [input, setInput] = useState(initialInput || '')
  const changeInput = (value: string) => { setInput(value); onInputChange?.(value) }
  const [planning, setPlanning] = useState(false), [notice, setNotice] = useState('')
  const submit = async () => {
    if (busy || planning || !input.trim() || !projectIds.length) return
    setPlanning(true); onPlanningChange?.(true); setNotice('')
    try {
      const plan = await resolveWeeklyRequest({ projectIds, input, engine, model })
      setNotice(plan.message)
      if (plan.scope) await onStart(engine, model, plan.scope, input)
    } catch (error) { setNotice(error instanceof Error ? error.message : '暂时无法理解任务，输入已保留，请重试') }
    finally { setPlanning(false); onPlanningChange?.(false) }
  }
  return <form className="space-y-5 p-5" onSubmit={event => { event.preventDefault(); void submit() }}>
    <fieldset disabled={busy || planning} className="space-y-5">
      <fieldset><legend className="mb-2 text-sm">选择项目 · 最多 5 个</legend>
        <div className="max-h-40 overflow-y-auto rounded-md border p-2">{projects.map(project => <label key={project.id} className="flex min-h-11 items-center gap-3 px-2 text-sm">
          <input type="checkbox" checked={projectIds.includes(project.id)} disabled={!projectIds.includes(project.id) && projectIds.length >= 5} onChange={event => setProjects(event.target.checked ? [...projectIds, project.id] : projectIds.filter(id => id !== project.id))} />
          <span className="min-w-0 truncate" title={project.path}>{project.name}</span>
        </label>)}{!projects.length && <p className="py-3 text-sm">没有可用项目，请先在项目库登记并允许访问。</p>}</div>
      </fieldset>
      <label className="block text-sm">交给助理的工作
        <textarea className="wa-field mt-2 min-h-32 resize-y" maxLength={12000} value={input} onChange={event => changeInput(event.target.value)} placeholder="例如：看看我上周张凯的提交，整理成可以发给领导的周报" />
      </label>
      <div className="flex items-center gap-3"><VoiceInputButton scope="work-assistants" disabled={busy || planning} onText={text => changeInput(`${input}${input ? '\n' : ''}${text}`)} />
        <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--color-muted-foreground)]">直接说作者和时间，助理会识别；只读取已有提交，不拉取或修改项目。</p>
        <Button type="submit" className="min-h-11 shrink-0" disabled={!input.trim() || !projectIds.length}><Send className="mr-2 size-4" />{planning || busy ? '正在准备…' : '交给助理'}</Button>
      </div>
      <details className="border-t pt-3"><summary className="cursor-pointer py-2 text-xs text-[var(--color-muted-foreground)]">高级设置 · 默认使用 Codex</summary>
        <div className="mt-3 space-y-4"><div className="text-sm"><label htmlFor="wa-engine">执行引擎</label><FixedCombobox id="wa-engine" className="mt-2 min-h-11" value={engine} onChange={setEngine} options={[{ value: 'codex', label: 'Codex · 官方账号' }, { value: 'claude', label: 'Claude · 官方账号' }]} /></div>
          <label className="block text-sm">模型（可选）<input className="wa-field mt-2" value={model} onChange={event => setModel(event.target.value)} placeholder="留空使用引擎默认" maxLength={120} /></label></div>
      </details>
    </fieldset>
    {notice && <p role="status" className="text-sm leading-6">{notice}</p>}
  </form>
}

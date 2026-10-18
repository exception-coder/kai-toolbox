import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FixedCombobox } from '@/components/ui/fixed-combobox'
import type { Project, Scope } from '../api'

const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function AssistantSetup({ assistant, projects, busy, onStart }: {
  assistant: string; projects: Project[]; busy: boolean; onStart: (engine: string, model: string, scope: Scope) => void
}) {
  const [engine, setEngine] = useState('codex'), [model, setModel] = useState('')
  const [scope, setScope] = useState<Scope>(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const now = new Date(`${today}T12:00:00`), monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() + 6) % 7)
    return { projectIds: [], from: day(monday), through: day(now), author: '' }
  })
  return <form className="space-y-5 p-5" onSubmit={event => { event.preventDefault(); onStart(engine, model, scope) }}>
    <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">{assistant === 'weekly' ? '先确认项目、作者与周期。助理读取已有 Git 历史，不会拉取、推送或修改项目。' : '登记通过安全表单进行。普通对话可整理资源信息，请勿输入密码、Token 或私钥。'}</p>
    <fieldset disabled={busy} className="space-y-4">
      <div className="text-sm"><label htmlFor="wa-engine">执行引擎</label><FixedCombobox id="wa-engine" className="mt-2 min-h-11" disabled={busy} value={engine} onChange={setEngine} options={[{ value: 'codex', label: 'Codex · 官方账号' }, { value: 'claude', label: 'Claude · 官方账号' }]} /></div>
      <label className="block text-sm">模型（可选）<input className="wa-field mt-2" value={model} onChange={event => setModel(event.target.value)} placeholder="留空使用引擎默认" maxLength={120} /></label>
      {assistant === 'weekly' && <>
        <fieldset><legend className="mb-2 text-sm">项目 · 最多 5 个</legend><div className="max-h-40 overflow-y-auto rounded-md border p-2">{projects.map(project => <label key={project.id} className="flex min-h-11 items-center gap-3 px-2 text-sm"><input type="checkbox" checked={scope.projectIds.includes(project.id)} disabled={!scope.projectIds.includes(project.id) && scope.projectIds.length >= 5} onChange={event => setScope(current => ({ ...current, projectIds: event.target.checked ? [...current.projectIds, project.id] : current.projectIds.filter(id => id !== project.id) }))} /><span className="min-w-0 truncate" title={project.path}>{project.name}</span></label>)}{!projects.length && <p className="py-3 text-sm">没有可用项目，请先在项目库登记并允许访问。</p>}</div></fieldset>
        <label className="block text-sm">作者姓名或邮箱<input required className="wa-field mt-2" maxLength={120} value={scope.author} onChange={event => setScope(current => ({ ...current, author: event.target.value }))} placeholder="与 Git 作者精确匹配" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">开始日期<input type="date" required className="wa-field mt-2" value={scope.from} onChange={event => setScope(current => ({ ...current, from: event.target.value }))} /></label><label className="text-sm">结束日期（含）<input type="date" required className="wa-field mt-2" value={scope.through} onChange={event => setScope(current => ({ ...current, through: event.target.value }))} /></label></div>
      </>}
      <Button type="submit" className="min-h-11" disabled={assistant === 'weekly' && !scope.projectIds.length}>{busy ? '正在准备任务…' : '创建任务会话'}</Button>
    </fieldset>
  </form>
}

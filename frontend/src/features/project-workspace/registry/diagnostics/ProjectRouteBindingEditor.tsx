import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistryError } from '../RegistryStates'
import { deleteProjectRouteBinding, listWorkspaceProjectPaths, saveProjectRouteBinding } from './api'
import type { ProjectRouteBinding } from './types'

interface Props { project: string; binding?: ProjectRouteBinding; sourcePath?: string }

export function ProjectRouteBindingEditor({ project, binding, sourcePath }: Props) {
  const cache = useQueryClient()
  const [path, setPath] = useState(sourcePath ?? binding?.projectPath ?? '')
  const [aliases, setAliases] = useState(binding?.aliases.join(', ') ?? '')
  const [saved, setSaved] = useState(false)
  const paths = useQuery({ queryKey: ['system-route-workspace-paths'], queryFn: listWorkspaceProjectPaths })
  const refresh = async () => {
    setSaved(true)
    await cache.resetQueries({ queryKey: ['system-route-inspection', project] })
    await Promise.all(['system-route-candidates', 'project-route-bindings']
      .map(key => cache.invalidateQueries({ queryKey: [key] })))
  }
  const save = useMutation({ mutationFn: () => saveProjectRouteBinding(project, path.trim(),
    aliases.split(/[,，]/).map(value => value.trim()).filter(Boolean)), onSuccess: refresh })
  const reset = useMutation({ mutationFn: () => deleteProjectRouteBinding(project), onSuccess: refresh })
  const busy = save.isPending || reset.isPending
  return <section className="space-y-4 border-t border-[var(--color-border)] pt-5" aria-label="AI 源码绑定">
    <div><h3 className="text-sm font-semibold">源码与系统别名绑定</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">告诉 AI 这个知识项目对应哪份本机源码。修改绑定不会移动源码，也不会重新生成图谱。</p></div>
    {!project ? <p className="text-sm text-[var(--color-muted-foreground)]">先选择知识项目，再保存对应的源码目录。</p> : <>
      <label className="grid gap-2 text-sm">源码根目录<Input list="diagnostic-source-paths" value={path} onChange={event => { setPath(event.target.value); setSaved(false) }} /></label>
      <datalist id="diagnostic-source-paths">{paths.data?.map(value => <option key={value} value={value} />)}</datalist>
      <label className="grid gap-2 text-sm">系统别名（逗号分隔）<Input value={aliases} onChange={event => { setAliases(event.target.value); setSaved(false) }} placeholder="例如 ERP, 优你" /></label>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!path.trim() || busy} onClick={() => save.mutate()}>{save.isPending ? '保存中…' : '保存绑定'}</Button>
        {binding?.explicit && <Button size="sm" variant="outline" disabled={busy} onClick={() => reset.mutate()}>恢复自动发现</Button>}</div>
      {saved && <p role="status" className="text-sm">绑定已更新，请重新执行诊断确认访问链路。</p>}
      <RegistryError error={save.error ?? reset.error} />
      <p className="break-all text-xs leading-5 text-[var(--color-muted-foreground)]">知识项目：{project} · {binding?.sourceAvailable ? '源码可达' : '源码待确认'} · {binding?.knowledgeAvailable ? '已找到知识定义' : '知识定义待补齐'}</p>
    </>}
  </section>
}

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import { registerProject, updateProject } from './api'
import { emptyMetadata, type ProjectMetadata, type RegistryProject } from './types'
import { RegistryError } from './RegistryStates'

interface Props { project?: RegistryProject; onSaved: (project: RegistryProject) => void; onCancel?: () => void }

export function ProjectRegistrationForm({ project, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<ProjectMetadata>(project?.metadata ?? emptyMetadata)
  const workspaces = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, enabled: !project })
  const save = useMutation({
    mutationFn: () => project ? updateProject(project.id, draft) : registerProject(draft),
    onSuccess: onSaved,
  })
  const patch = (key: keyof ProjectMetadata, value: string) => setDraft(old => ({ ...old, [key]: value }))
  const choices = workspaces.data?.roots.flatMap(root => root.dirs) ?? []
  return <form className="max-w-3xl space-y-6" onSubmit={event => { event.preventDefault(); save.mutate() }}>
    {!project && choices.length > 0 && <label className="block space-y-2 text-sm">
      <span className="font-medium">从已发现的工作区选择</span>
      <select className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3" value=""
        onChange={event => { const found = choices.find(item => item.path === event.target.value); if (found) setDraft(old => ({ ...old, name: found.alias || found.name, localPath: found.path })) }}>
        <option value="">选择目录，填入登记信息</option>
        {choices.map(item => <option key={item.path} value={item.path}>{item.alias || item.name} · {item.path}</option>)}
      </select>
    </label>}
    <div className="grid gap-4 sm:grid-cols-2">
      {([
        ['name', '系统名称', '例如：Forge', true], ['owner', '负责团队', '例如：工程平台', false],
        ['localPath', '本地代码目录', '完整的本地绝对路径', true], ['repoUrl', '仓库地址', 'https://… 或 git@…', false],
        ['defaultBranch', '默认分支', 'main', false], ['devUrl', '开发地址', 'http://localhost:5173', false],
        ['testUrl', '测试地址', 'https://…', false],
      ] as const).map(([key, label, placeholder, required]) => <label key={key} className="block space-y-2 text-sm">
        <span className="font-medium">{label}{required && <span className="ml-1 text-[var(--color-muted-foreground)]">*</span>}</span>
        <Input value={draft[key]} placeholder={placeholder} required={required} maxLength={key === 'name' ? 120 : 2000}
          onChange={event => patch(key, event.target.value)} disabled={save.isPending} />
      </label>)}
      <label className="block space-y-2 text-sm"><span className="font-medium">仓库类型</span>
        <select className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3"
          value={draft.repoType} onChange={event => patch('repoType', event.target.value)} disabled={save.isPending}>
          <option value="git">Git</option><option value="svn">SVN</option><option value="local">本地目录</option>
        </select>
      </label>
    </div>
    <p className="text-xs text-[var(--color-muted-foreground)]">登记后再执行 Full Init。技术栈、代码图谱和验证规则由初始化发现。</p>
    <RegistryError error={save.error} />
    <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? '正在保存…' : project ? '保存设置' : '登记项目'}</Button>
      {onCancel && <Button type="button" variant="ghost" disabled={save.isPending} onClick={onCancel}>取消</Button>}
    </div>
  </form>
}

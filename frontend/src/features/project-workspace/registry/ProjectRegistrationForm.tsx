import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { registerProject, updateProject } from './api'
import { emptyMetadata, type ProjectMetadata, type RegistryProject } from './types'
import { RegistryError } from './RegistryStates'

interface Props { project?: RegistryProject; initial?: Partial<ProjectMetadata>; onSaved: (project: RegistryProject) => void; onCancel?: () => void }

export function ProjectRegistrationForm({ project, initial, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<ProjectMetadata>(project?.metadata ?? { ...emptyMetadata, ...initial })
  const save = useMutation({
    mutationFn: () => project ? updateProject(project.id, draft) : registerProject(draft),
    onSuccess: onSaved,
  })
  const patch = (key: keyof ProjectMetadata, value: string) => setDraft(old => ({ ...old, [key]: value }))
  return <form className="max-w-3xl space-y-6" onSubmit={event => { event.preventDefault(); save.mutate() }}>
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

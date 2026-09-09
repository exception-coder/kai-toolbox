import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getConfigBlock, updateConfigBlock, type ConfigBlockView } from '@/features/config-center/public-api'
import { Button } from '@/components/ui/button'
import { RegistryError } from './RegistryStates'

const WORKSPACE = 'toolbox.claude-chat.workspace'
const PROJECTS = 'toolbox.projects'

export function ProjectDirectorySettings() {
  return <section className="max-w-3xl space-y-8">
    <div><h2 className="font-semibold">项目目录</h2><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">统一维护本机项目来源。扫描各目录的一级子目录；修改扫描范围不会删除已登记系统。</p></div>
    <DirectoryBlock id={WORKSPACE} field="roots" title="工作区目录" multiple />
    <DirectoryBlock id={PROJECTS} field="root" title="默认项目目录" />
  </section>
}

function DirectoryBlock({ id, field, title, multiple = false }: { id: string; field: string; title: string; multiple?: boolean }) {
  const [saved, setSaved] = useState(false)
  const query = useQuery({ queryKey: ['config-block', id], queryFn: () => getConfigBlock(id) })
  return <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
    <RegistryError error={query.error} retry={() => void query.refetch()} />
    {query.isLoading && <p role="status" className="text-sm">正在读取{title}…</p>}
    {saved && <p role="status" className="text-sm">{title}已保存，本地项目将按扫描缓存周期刷新。</p>}
    {query.data && <DirectoryEditor key={JSON.stringify(query.data)} block={query.data} field={field} title={title} multiple={multiple} onSaved={() => setSaved(true)} onEdit={() => setSaved(false)} />}
  </div>
}

export function directoryValues(block: ConfigBlockView, key: string): string[] {
  const direct = block.entries.find(entry => entry.key === key)
  if (direct) return direct.values ?? (direct.value ? [direct.value] : [])
  return block.entries.filter(entry => entry.key.startsWith(`${key}[`))
    .sort((a, b) => Number(a.key.match(/\[(\d+)\]$/)?.[1]) - Number(b.key.match(/\[(\d+)\]$/)?.[1]))
    .map(entry => entry.value ?? '').filter(Boolean)
}

function DirectoryEditor({ block, field, title, multiple, onSaved, onEdit }: { block: ConfigBlockView; field: string; title: string; multiple: boolean; onSaved: () => void; onEdit: () => void }) {
  const cache = useQueryClient()
  const key = `${block.id}.${field}`
  const initial = directoryValues(block, key).join('\n')
  const [draft, setDraft] = useState(initial)
  const save = useMutation({
    mutationFn: () => {
      const values = [...new Set(draft.split('\n').map(value => value.trim()).filter(Boolean))]
      if (!multiple && values.length !== 1) throw new Error('请填写一个完整的本地目录')
      if (values.some(value => !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value))) throw new Error('请填写绝对路径，例如 D:/Projects')
      const overrides = multiple && values.length ? Object.fromEntries(values.map((value, index) => [`${key}[${index}]`, value])) : { [key]: values[0] ?? '' }
      return updateConfigBlock(block.id, overrides, multiple ? [key] : [])
    },
    onSuccess: async () => {
      onSaved()
      await Promise.all(['claude-chat-workspaces', 'projects', 'config-block'].map(name => cache.invalidateQueries({ queryKey: [name] })))
    },
  })
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); save.mutate() }}>
    <label className="block space-y-2 text-sm"><span className="font-medium">{title}</span>
      <textarea className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
        rows={multiple ? 4 : 2} value={draft} disabled={save.isPending} onChange={event => { setDraft(event.target.value); onEdit() }} placeholder={multiple ? '每行一个目录，例如 D:/Projects' : '例如 D:/Projects'} />
    </label>
    <p className="text-xs text-[var(--color-muted-foreground)]">{multiple ? '供项目发现、模块工作区与 AI 会话共同使用。' : '保留原项目管理的扫描范围与本地文件操作；无需再去配置中心维护。'}</p>
    <RegistryError error={save.error} />
    <Button type="submit" size="sm" disabled={save.isPending || draft === initial}>{save.isPending ? '正在保存…' : `保存${title}`}</Button>
  </form>
}

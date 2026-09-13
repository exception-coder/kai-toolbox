import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateConfigBlock, PROJECT_DIRECTORY_BLOCKS, type ConfigBlockView } from '@/features/config-center/public-api'
import { Button } from '@/components/ui/button'
import { RegistryError } from './RegistryStates'
import { directoriesUnified, directoryDraft, directoryUpdate, type DirectoryField, type DirectorySection } from './directorySettingsModel'

interface Props {
  block: ConfigBlockView
  section: DirectorySection
  onSaved: () => void
  onEdit: () => void
}

export function ProjectDirectoryEditor({ block, section, onSaved, onEdit }: Props) {
  const cache = useQueryClient()
  const initial = directoryDraft(block, section)
  const [draft, setDraft] = useState(initial)
  const save = useMutation({
    mutationFn: () => {
      const firstUnifiedSave = block.id === PROJECT_DIRECTORY_BLOCKS.workspace && !directoriesUnified(block)
      const { overrides, replacePrefixes } = directoryUpdate(section, initial, draft, firstUnifiedSave)
      if (firstUnifiedSave) {
        // 首次保存用同一请求发布完整列表与切换标记，失败时旧来源仍有效。
        overrides[`${block.id}.directories-unified`] = 'true'
      }
      return updateConfigBlock(block.id, overrides, replacePrefixes)
    },
    onSuccess: async updated => {
      cache.setQueryData(['config-block', block.id], updated)
      onSaved()
      await Promise.all(['claude-chat-workspaces', 'projects'].map(name => cache.invalidateQueries({ queryKey: [name] })))
    },
  })
  const renderField = (field: DirectoryField) => <DirectoryInput key={field.name} field={field} value={draft[field.name]}
    disabled={save.isPending} onChange={value => {
      setDraft(current => ({ ...current, [field.name]: value }))
      save.reset()
      onEdit()
    }} />
  const dirty = section.fields.some(field => draft[field.name] !== initial[field.name])
    || (block.id === PROJECT_DIRECTORY_BLOCKS.workspace && !directoriesUnified(block))
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
    {renderField(section.fields[0])}
    <details className="text-sm">
      <summary className="w-fit cursor-pointer py-1 text-[var(--color-muted-foreground)]">{section.title}高级设置</summary>
      <div className="mt-4 space-y-5">{section.fields.slice(1).map(renderField)}</div>
    </details>
    <RegistryError error={save.error} />
    <Button type="submit" size="sm" disabled={save.isPending || !dirty}>{save.isPending ? '正在保存…' : `保存${section.title}`}</Button>
  </form>
}

function DirectoryInput({ field, value, disabled, onChange }: {
  field: DirectoryField; value: string; disabled: boolean; onChange: (value: string) => void
}) {
  const style = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]'
  return <div className="space-y-2">
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{field.label}</span>
      {field.kind === 'duration'
        ? <input className={`${style} max-w-48 block`} inputMode="numeric" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
        : <textarea className={style} rows={field.kind === 'paths' ? 3 : 2} value={value} disabled={disabled}
          onChange={event => onChange(event.target.value)} placeholder={field.kind === 'prefixes' ? '每行一个前缀' : field.optional ? '留空使用默认位置' : '例如 D:/Projects'} />}
    </label>
    <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">{field.help}</p>
  </div>
}

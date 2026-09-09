import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import type { Rule } from '../types'
import { WorkspaceDialog } from './WorkspaceDialog'

export function RuleEditor({ initial, create, close }: { initial: Rule; create: boolean; close: () => void }) {
  const [draft, setDraft] = useState(initial)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => procurementApi.saveRule(draft, create),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['procurement'] }); close() } })
  return <WorkspaceDialog title={create ? '新增规则' : `编辑 ${initial.id}`} description="章节范围、共现条件与反例会一起提供给智能解析。规则内容不会作为脚本执行。" close={close}>
    <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="procurement-form-label">规则编号<input className="procurement-input" value={draft.id} required maxLength={80}
        disabled={!create} pattern="[A-Za-z0-9_-]+" onChange={e => setDraft({ ...draft, id: e.target.value })} /></label>
        <label className="procurement-form-label">关键词 / 名称<input className="procurement-input" value={draft.name} required maxLength={300}
          onChange={e => setDraft({ ...draft, name: e.target.value })} /></label></div>
      {Object.entries(draft.fields).filter(([key]) => !['原始关键词/表达', '反向词/表达', '规则名称', '名称'].includes(key)).map(([key, value]) => <label key={key} className="procurement-form-label">{key}
        <textarea className="procurement-input" rows={2} maxLength={2000} value={value}
          onChange={e => setDraft({ ...draft, fields: { ...draft.fields, [key]: e.target.value } })} /></label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />启用此规则</label>
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>取消</Button><Button disabled={save.isPending}>{save.isPending ? '保存中' : '保存规则'}</Button></div>
    </form>
  </WorkspaceDialog>
}

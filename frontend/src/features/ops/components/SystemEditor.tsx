import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SystemPayload } from '../types'

interface Props {
  value: SystemPayload
  editing: boolean
  saving: boolean
  onChange: (next: SystemPayload) => void
  onCancel: () => void
  onSave: () => void
  onDelete?: () => void
}

/** 系统增删改内嵌编辑器。 */
export function SystemEditor({ value, editing, saving, onChange, onCancel, onSave, onDelete }: Props) {
  const patch = (next: Partial<SystemPayload>) => onChange({ ...value, ...next })

  return (
    <div className="grid gap-3 rounded-md border bg-[var(--color-background)] p-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          value={value.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="系统名称（例如 订单中心）"
        />
        <Input
          value={value.code ?? ''}
          onChange={e => patch({ code: e.target.value })}
          placeholder="英文标识（order-center）"
        />
        <Input
          value={value.owner ?? ''}
          onChange={e => patch({ owner: e.target.value })}
          placeholder="负责人（可空）"
        />
      </div>
      <Input
        value={value.description ?? ''}
        onChange={e => patch({ description: e.target.value })}
        placeholder="系统描述（可空）"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          <Save />
          保存
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        {editing && onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="ml-auto text-[var(--color-destructive)]"
          >
            <Trash2 />
            删除系统
          </Button>
        )}
      </div>
    </div>
  )
}

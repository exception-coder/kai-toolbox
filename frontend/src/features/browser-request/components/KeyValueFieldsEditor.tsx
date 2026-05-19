import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VarBindableField, type VarOption } from './VarPickerPopover'

/**
 * 通用 key-value 字段编辑器。query 参数 和 headers 都用它。
 *
 * 数据结构：保留顺序的数组（不是 Map）—— query 参数顺序对 GET 接口可能敏感。
 */
export interface KvPair {
  key: string
  value: string
}

export function KeyValueFieldsEditor({
  pairs, onChange, varOptions, addLabel = '+ 添加',
}: {
  pairs: KvPair[]
  onChange: (next: KvPair[]) => void
  /** 可用变量（用于每行 value 的「🎯 绑变量」按钮） */
  varOptions: VarOption[]
  addLabel?: string
}) {
  const update = (idx: number, mut: (p: KvPair) => KvPair) => {
    const next = pairs.slice()
    next[idx] = mut(next[idx])
    onChange(next)
  }
  const remove = (idx: number) => onChange(pairs.filter((_, i) => i !== idx))
  const add = () => onChange([...pairs, { key: '', value: '' }])

  return (
    <div className="space-y-1">
      {pairs.length === 0 && (
        <div className="text-xs text-[var(--color-muted-foreground)]">（无）</div>
      )}
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            className="w-40 font-mono"
            placeholder="key"
            value={p.key}
            onChange={e => update(i, x => ({ ...x, key: e.target.value }))}
          />
          <span className="text-[var(--color-muted-foreground)]">=</span>
          <VarBindableField
            className="flex-1"
            value={p.value}
            onChange={v => update(i, x => ({ ...x, value: v }))}
            options={varOptions}
            placeholder="value"
          />
          <Button size="sm" variant="ghost" onClick={() => remove(i)} title="删除">
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  )
}

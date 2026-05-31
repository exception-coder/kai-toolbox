import { KeyRound, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { HostPayload } from '../types'

interface Props {
  value: HostPayload
  editing: boolean
  saving: boolean
  testing: boolean
  onChange: (next: HostPayload) => void
  onCancel: () => void
  onSave: () => void
  onTest: () => void
  onDelete?: () => void
}

/** 主机增删改 + 测试连接的内嵌编辑器。 */
export function HostEditor({
  value,
  editing,
  saving,
  testing,
  onChange,
  onCancel,
  onSave,
  onTest,
  onDelete,
}: Props) {
  const patch = (next: Partial<HostPayload>) => onChange({ ...value, ...next })

  return (
    <div className="grid gap-3 rounded-md border bg-[var(--color-background)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_90px]">
        <Input
          value={value.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="主机名称（例如 prod-ecs-1）"
        />
        <Input
          value={value.host}
          onChange={e => patch({ host: e.target.value })}
          placeholder="Host / IP"
        />
        <Input
          value={String(value.port)}
          onChange={e => patch({ port: Number(e.target.value) || 22 })}
          placeholder="端口"
          inputMode="numeric"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <Input
          value={value.username}
          onChange={e => patch({ username: e.target.value })}
          placeholder="用户名（root / ubuntu / ec2-user）"
        />
        <select
          value={value.authType}
          onChange={e => patch({ authType: e.target.value as HostPayload['authType'] })}
          className="h-9 rounded-md border bg-[var(--color-background)] px-3 text-sm"
        >
          <option value="KEY">密钥</option>
          <option value="PASSWORD">密码</option>
        </select>
      </div>

      {value.authType === 'KEY' ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
          <Input
            value={value.privateKey ?? ''}
            onChange={e => patch({ privateKey: e.target.value })}
            placeholder="私钥路径，例如 C:\Users\zhang\.ssh\id_ed25519"
          />
          <Input
            type="password"
            value={value.passphrase ?? ''}
            onChange={e => patch({ passphrase: e.target.value })}
            placeholder={editing ? 'Passphrase（留空保持原值）' : 'Passphrase（可空）'}
          />
        </div>
      ) : (
        <Input
          type="password"
          value={value.password ?? ''}
          onChange={e => patch({ password: e.target.value })}
          placeholder={editing ? '密码（留空保持原值）' : '密码'}
        />
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <Input
          value={value.tag ?? ''}
          onChange={e => patch({ tag: e.target.value })}
          placeholder="标签（可空），例如 prod / staging / nas"
        />
        <Input
          value={value.note ?? ''}
          onChange={e => patch({ note: e.target.value })}
          placeholder="备注（可空）"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          <Save />
          保存
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testing}>
          <KeyRound />
          {editing ? '测试已存主机' : '先测一下当前填的'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="ml-auto text-[var(--color-destructive)]"
          >
            <Trash2 />
            删除
          </Button>
        )}
      </div>
    </div>
  )
}

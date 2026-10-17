import { LoaderCircle, Save, Trash2, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import type { DatasourcePayload, DatasourceType, TestResult } from '../types'
import { ENV_LABELS, ENV_PRESETS, TYPE_DEFAULT_PORT, TYPE_META, TYPE_OPTIONS } from '../meta'
import { ConnectionTestFeedback } from './ConnectionTestFeedback'

interface Props {
  value: DatasourcePayload
  editing: boolean
  saving: boolean
  testing: boolean
  testDisabled: boolean
  testResult: TestResult | null
  onChange: (next: DatasourcePayload) => void
  onCancel: () => void
  onSave: () => void
  onTest?: () => void
  onDelete?: () => void
}

/** 中间件实例增删改 + 测试连接的内嵌编辑器。 */
export function DatasourceEditor({
  value, editing, saving, testing, testDisabled, testResult, onChange, onCancel, onSave, onTest, onDelete,
}: Props) {
  const patch = (next: Partial<DatasourcePayload>) => onChange({ ...value, ...next })
  const dbLabel = dbNameLabel(value.type)

  return (
    <div className="grid gap-3 rounded-md border bg-[var(--color-background)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
        <Combobox allowCustom={false} aria-label="中间件类型" disabled={saving || testing}
          value={value.type}
          onChange={next => {
            const t = next as DatasourceType
            patch({ type: t, port: TYPE_DEFAULT_PORT[t] })
          }}
          options={TYPE_OPTIONS.map(type => ({ value: type, label: `${TYPE_META[type].label}${TYPE_META[type].queryable ? '' : '（暂只登记）'}` }))}
        />
        <Combobox allowCustom={false} aria-label="部署环境" disabled={saving || testing}
          value={value.env}
          onChange={env => patch({ env })}
          placeholder="选择环境"
          options={ENV_PRESETS.map(env => ({ value: env, label: `${env} · ${ENV_LABELS[env]}` }))}
        />
        <Input
          value={value.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="实例名称（订单库-主库）"
        />
      </div>

      {value.env && !ENV_PRESETS.includes(value.env) && <p role="status" className="break-words text-xs text-muted-foreground">当前环境“{value.env}”为历史值；未重新选择时保留原值，也可从环境下拉中选择标准环境。</p>}

      <div className="grid gap-2 sm:grid-cols-[2fr_90px_1fr]">
        <Input value={value.host} onChange={e => patch({ host: e.target.value })} placeholder="Host / IP" />
        <Input
          value={String(value.port)}
          onChange={e => patch({ port: Number(e.target.value) || 0 })}
          placeholder="端口"
          inputMode="numeric"
        />
        <Input
          value={value.dbName ?? ''}
          onChange={e => patch({ dbName: e.target.value })}
          placeholder={dbLabel}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Input
          value={value.username ?? ''}
          onChange={e => patch({ username: e.target.value })}
          placeholder="用户名（可空）"
        />
        <Input
          type="password"
          value={value.password ?? ''}
          onChange={e => patch({ password: e.target.value })}
          placeholder={editing ? '密码（留空保持原值）' : '密码（可空）'}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Input
          value={value.params ?? ''}
          onChange={e => patch({ params: e.target.value })}
          placeholder="额外连接参数（useSSL=false&serverTimezone=UTC）"
        />
        <Input
          value={value.note ?? ''}
          onChange={e => patch({ note: e.target.value })}
          placeholder="备注（可空）"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={saving || testing}>
          <Save />
          保存
        </Button>
        {editing && onTest && (
          <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testDisabled || saving}>
            {testing ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Wifi />}
            {testing ? '测试中…' : '测试连接'}
          </Button>
        )}
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
            删除
          </Button>
        )}
      </div>
      {editing && onTest && (
        <div>
          <p className="text-xs text-muted-foreground">测试使用已保存的连接配置；修改后请先保存。</p>
          <ConnectionTestFeedback testing={testing} result={testResult} />
        </div>
      )}
    </div>
  )
}

function dbNameLabel(type: DatasourceType): string {
  switch (type) {
    case 'MYSQL': return '库名（database）'
    case 'ORACLE': return 'Service Name'
    case 'REDIS': return 'DB 索引（0）'
    case 'RABBITMQ': return 'vhost'
    default: return '库/命名空间（可空）'
  }
}

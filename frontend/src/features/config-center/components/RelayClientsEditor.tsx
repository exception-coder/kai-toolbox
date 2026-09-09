import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getConfigBlock, updateConfigBlock, type ConfigBlockView } from '../api'

export const RELAY_BLOCK = 'toolbox.claude-chat.session-client.relay'
const CLIENTS_KEY = `${RELAY_BLOCK}.clients`

interface ClientDraft {
  clientId: string
  name: string
  clientSecret: string
  enabled: boolean
}

/** 在既有配置块 API 上提供客户端行编辑，不另建配置存储。 */
export function RelayClientsEditor() {
  const query = useQuery({ queryKey: ['config-block', RELAY_BLOCK], queryFn: () => getConfigBlock(RELAY_BLOCK), refetchOnWindowFocus: false })
  if (query.isPending) return <p role="status">正在加载 Relay 客户端…</p>
  if (query.isError) return (
    <div className="space-y-3">
      <p role="alert">无法加载 Relay 客户端：{query.error.message}</p>
      <Button variant="outline" onClick={() => query.refetch()}>重试</Button>
    </div>
  )
  return <RelayClientsForm block={query.data} />
}

function readDraft(block: ConfigBlockView) {
  const values = Object.fromEntries(block.entries.map(entry => [entry.key, entry.value ?? '']))
  const clients = new Map<number, ClientDraft>()
  for (const entry of block.entries) {
    if (!entry.key.startsWith(CLIENTS_KEY)) continue
    const match = /^\[(\d+)]\.(client-id|name|client-secret|enabled)$/.exec(entry.key.slice(CLIENTS_KEY.length))
    if (!match) continue
    const index = Number(match[1])
    const client = clients.get(index) ?? { clientId: '', name: '', clientSecret: '', enabled: true }
    if (match[2] === 'client-id') client.clientId = entry.value ?? ''
    if (match[2] === 'name') client.name = entry.value ?? ''
    if (match[2] === 'client-secret') client.clientSecret = entry.value ?? ''
    if (match[2] === 'enabled') client.enabled = entry.value === 'true'
    clients.set(index, client)
  }
  const managed = values[`${RELAY_BLOCK}.managed`] === 'true'
  if (!managed && values[`${RELAY_BLOCK}.client-id`]) {
    clients.set(-1, {
      clientId: values[`${RELAY_BLOCK}.client-id`],
      name: values[`${RELAY_BLOCK}.client-id`],
      clientSecret: values[`${RELAY_BLOCK}.client-secret`] ?? '',
      enabled: true,
    })
  }
  return { enabled: values[`${RELAY_BLOCK}.enabled`] === 'true', managed,
    clients: [...clients.entries()].sort(([a], [b]) => a - b).map(([, client]) => client) }
}

function RelayClientsForm({ block }: { block: ConfigBlockView }) {
  const qc = useQueryClient()
  const initial = readDraft(block)
  const [enabled, setEnabled] = useState(initial.enabled)
  const [clients, setClients] = useState(initial.clients)
  const [saved, setSaved] = useState(false)
  const dirty = enabled !== initial.enabled || JSON.stringify(clients) !== JSON.stringify(initial.clients)
  const save = useMutation({
    mutationFn: () => {
      const overrides: Record<string, string> = {
        [`${RELAY_BLOCK}.enabled`]: String(enabled), [`${RELAY_BLOCK}.managed`]: 'true',
      }
      if (clients.length === 0) overrides[CLIENTS_KEY] = ''
      clients.forEach((client, index) => {
        const prefix = `${CLIENTS_KEY}[${index}]`
        overrides[`${prefix}.client-id`] = client.clientId
        overrides[`${prefix}.name`] = client.name
        overrides[`${prefix}.client-secret`] = client.clientSecret
        overrides[`${prefix}.enabled`] = String(client.enabled)
      })
      return updateConfigBlock(RELAY_BLOCK, overrides, [CLIENTS_KEY])
    },
    onSuccess: updated => {
      qc.setQueryData(['config-block', RELAY_BLOCK], updated)
      setSaved(true)
    },
  })
  const change = (index: number, patch: Partial<ClientDraft>) => {
    setSaved(false)
    setClients(current => current.map((client, i) => i === index ? { ...client, ...patch } : client))
  }
  return (
    <form className="max-w-5xl space-y-6" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Relay 接入客户端</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">每个业务系统使用独立凭据，保存后立即生效。</p>
        </div>
        <Button type="submit" size="sm" disabled={save.isPending || (initial.managed && !dirty)}>
          <Save className="size-4" />{save.isPending ? '正在保存…' : '保存并生效'}
        </Button>
      </div>
      {!initial.managed && <p className="text-sm text-[var(--color-muted-foreground)]">当前使用部署凭据。首次保存将切换为以下客户端列表。</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={save.isPending} onChange={event => { setEnabled(event.target.checked); setSaved(false) }} />
        开放 Relay 接入
      </label>
      {save.isError && <p role="alert" className="text-sm text-[var(--color-destructive)]">保存失败：{save.error.message}。请修改后重试。</p>}
      {saved && <p role="status" className="text-sm">已保存并生效。</p>}
      <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
        <legend className="sr-only">接入客户端</legend>
        {clients.length === 0 && <p className="border-y py-6 text-sm text-[var(--color-muted-foreground)]">尚无客户端。添加业务系统后填写独立凭据；保存空列表将停止所有客户端接入。</p>}
        {clients.map((client, index) => (
          <div key={index} className="grid grid-cols-1 gap-3 border-b pb-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_auto]">
            <ClientInput label={`Client ID ${index + 1}`} value={client.clientId} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}" onChange={value => change(index, { clientId: value })} />
            <ClientInput label={`名称 ${index + 1}`} value={client.name} maxLength={100} onChange={value => change(index, { name: value })} />
            <ClientInput label={`Secret ${index + 1}`} value={client.clientSecret} maxLength={512} secret onChange={value => change(index, { clientSecret: value })} />
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={client.enabled} onChange={event => change(index, { enabled: event.target.checked })} />启用</label>
              <Button type="button" variant="ghost" size="icon" aria-label={`删除客户端 ${index + 1}`} onClick={() => { setClients(current => current.filter((_, i) => i !== index)); setSaved(false) }}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={clients.length >= 100} onClick={() => { setClients(current => [...current, { clientId: '', name: '', clientSecret: '', enabled: true }]); setSaved(false) }}><Plus className="size-4" />添加客户端</Button>
      </fieldset>
    </form>
  )
}

function ClientInput({ label, value, secret, maxLength, pattern, onChange }: {
  label: string; value: string; secret?: boolean; maxLength: number; pattern?: string; onChange: (value: string) => void
}) {
  return <label className="space-y-1 text-xs text-[var(--color-muted-foreground)]">
    <span>{label}</span>
    <input required aria-label={label} type={secret ? 'password' : 'text'} autoComplete={secret ? 'new-password' : 'off'}
      maxLength={maxLength} pattern={pattern} value={value} onChange={event => onChange(event.target.value)}
      className="w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50" />
  </label>
}

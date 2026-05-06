import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, MonitorCog, Pencil, Play, Plus, Save, Server, Trash2, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import {
  createSshHost,
  deleteSshHost,
  listSshHosts,
  testSavedSshHost,
  testSshHost,
  updateSshHost,
} from '../api'
import type { ScanSourceType, SshHostPayload, SshHostView, StartScanPayload } from '../types'

interface ScanFormProps {
  onStart: (payload: StartScanPayload) => void
  disabled?: boolean
}

const EMPTY_HOST_FORM: SshHostPayload = {
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'KEY',
  privateKey: '',
  password: '',
  passphrase: '',
}

export function ScanForm({ onStart, disabled }: ScanFormProps) {
  const qc = useQueryClient()
  const [sourceType, setSourceType] = useState<ScanSourceType>('LOCAL_WINDOWS')
  const [path, setPath] = useState('')
  const [sshHostId, setSshHostId] = useState('')
  const [hostFormOpen, setHostFormOpen] = useState(false)
  const [editingHostId, setEditingHostId] = useState<string | null>(null)
  const [hostForm, setHostForm] = useState<SshHostPayload>(EMPTY_HOST_FORM)
  const [hostError, setHostError] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  const hostsQuery = useQuery({
    queryKey: ['treesize-ssh-hosts'],
    queryFn: listSshHosts,
  })
  const hosts = hostsQuery.data ?? []

  useEffect(() => {
    if (!sshHostId && hosts.length > 0) {
      setSshHostId(hosts[0].id)
    }
  }, [hosts, sshHostId])

  const selectedHost = useMemo(
    () => hosts.find(h => h.id === sshHostId) ?? null,
    [hosts, sshHostId],
  )

  const saveHostMutation = useMutation({
    mutationFn: (payload: SshHostPayload) =>
      editingHostId ? updateSshHost(editingHostId, payload) : createSshHost(payload),
    onMutate: () => {
      setHostError(null)
      setTestMessage(null)
    },
    onSuccess: host => {
      setSshHostId(host.id)
      setHostFormOpen(false)
      setEditingHostId(null)
      setHostForm(EMPTY_HOST_FORM)
      qc.invalidateQueries({ queryKey: ['treesize-ssh-hosts'] })
    },
    onError: err => setHostError(errorMessage(err)),
  })

  const deleteHostMutation = useMutation({
    mutationFn: deleteSshHost,
    onSuccess: () => {
      setSshHostId('')
      qc.invalidateQueries({ queryKey: ['treesize-ssh-hosts'] })
    },
    onError: err => setHostError(errorMessage(err)),
  })

  type TestHostInput = { id: string } | { payload: SshHostPayload }
  const testHostMutation = useMutation({
    mutationFn: (input: TestHostInput) =>
      'id' in input ? testSavedSshHost(input.id) : testSshHost(input.payload),
    onMutate: () => {
      setHostError(null)
      setTestMessage(null)
    },
    onSuccess: result => setTestMessage(result.ok ? `连接成功：${result.message}` : result.message),
    onError: err => setHostError(errorMessage(err)),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = path.trim()
    if (!trimmed) return
    if (sourceType === 'SSH' && !sshHostId) return
    onStart({ path: trimmed, sourceType, sshHostId: sourceType === 'SSH' ? sshHostId : null })
  }

  const editHost = (host: SshHostView) => {
    setEditingHostId(host.id)
    setHostFormOpen(true)
    setHostError(null)
    setTestMessage(null)
    setHostForm({
      name: host.name,
      host: host.host,
      port: host.port,
      username: host.username,
      authType: host.authType,
      privateKey: host.privateKey ?? '',
      password: '',
      passphrase: '',
    })
  }

  const newHost = () => {
    setEditingHostId(null)
    setHostForm(EMPTY_HOST_FORM)
    setHostError(null)
    setTestMessage(null)
    setHostFormOpen(true)
  }

  const canStart = path.trim() && (sourceType === 'LOCAL_WINDOWS' || sshHostId)

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={sourceType === 'LOCAL_WINDOWS' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceType('LOCAL_WINDOWS')}
              disabled={disabled}
            >
              <MonitorCog />
              本地 Windows
            </Button>
            <Button
              type="button"
              variant={sourceType === 'SSH' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceType('SSH')}
              disabled={disabled}
            >
              <Server />
              SSH 主机
            </Button>
            {sourceType === 'SSH' && selectedHost && (
              <Badge variant="secondary">{selectedHost.username}@{selectedHost.host}:{selectedHost.port}</Badge>
            )}
          </div>

          {sourceType === 'SSH' && (
            <div className="grid gap-2 rounded-md border bg-[var(--color-muted)]/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={sshHostId}
                  onChange={e => setSshHostId(e.target.value)}
                  disabled={disabled || hostsQuery.isLoading}
                  className="h-9 flex-1 rounded-md border bg-[var(--color-background)] px-3 text-sm"
                >
                  {hosts.length === 0 ? (
                    <option value="">暂无 SSH 主机</option>
                  ) : hosts.map(host => (
                    <option key={host.id} value={host.id}>
                      {host.name} - {host.username}@{host.host}:{host.port}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={newHost}>
                  <Plus />
                  新增
                </Button>
                {selectedHost && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => editHost(selectedHost)}>
                      <Pencil />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testHostMutation.mutate({ id: sshHostId })}
                      disabled={testHostMutation.isPending}
                    >
                      <Wifi />
                      测试
                    </Button>
                  </>
                )}
              </div>

              {hostFormOpen && (
                <SshHostEditor
                  value={hostForm}
                  editing={!!editingHostId}
                  saving={saveHostMutation.isPending}
                  testing={testHostMutation.isPending}
                  onChange={setHostForm}
                  onCancel={() => {
                    setHostFormOpen(false)
                    setEditingHostId(null)
                    setHostForm(EMPTY_HOST_FORM)
                  }}
                  onSave={() => saveHostMutation.mutate(hostForm)}
                  onTest={() => testHostMutation.mutate(
                    editingHostId ? { id: editingHostId } : { payload: hostForm }
                  )}
                  onDelete={editingHostId ? () => deleteHostMutation.mutate(editingHostId) : undefined}
                />
              )}

              {hostError && (
                <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
                  {hostError}
                </div>
              )}
              {testMessage && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {testMessage}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder={sourceType === 'SSH' ? '输入远程目录，例如 /var/log 或 /data' : '输入本地目录绝对路径，例如 D:\\Users\\zhang'}
              className="flex-1"
              disabled={disabled}
            />
            <Button type="submit" disabled={disabled || !canStart}>
              <Play />
              开始扫描
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function SshHostEditor({
  value,
  editing,
  saving,
  testing,
  onChange,
  onCancel,
  onSave,
  onTest,
  onDelete,
}: {
  value: SshHostPayload
  editing: boolean
  saving: boolean
  testing: boolean
  onChange: (next: SshHostPayload) => void
  onCancel: () => void
  onSave: () => void
  onTest: () => void
  onDelete?: () => void
}) {
  const patch = (next: Partial<SshHostPayload>) => onChange({ ...value, ...next })

  return (
    <div className="grid gap-3 rounded-md border bg-[var(--color-background)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_90px]">
        <Input value={value.name} onChange={e => patch({ name: e.target.value })} placeholder="主机名称" />
        <Input value={value.host} onChange={e => patch({ host: e.target.value })} placeholder="Host / IP" />
        <Input
          value={String(value.port)}
          onChange={e => patch({ port: Number(e.target.value) || 22 })}
          placeholder="端口"
          inputMode="numeric"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <Input value={value.username} onChange={e => patch({ username: e.target.value })} placeholder="用户名" />
        <select
          value={value.authType}
          onChange={e => patch({ authType: e.target.value as SshHostPayload['authType'] })}
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
            placeholder="私钥路径，例如 C:\\Users\\zhang\\.ssh\\id_ed25519"
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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          <Save />
          保存
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testing}>
          <KeyRound />
          测试连接
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        {onDelete && (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="ml-auto text-[var(--color-destructive)]">
            <Trash2 />
            删除
          </Button>
        )}
      </div>
    </div>
  )
}

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : String(err)
}

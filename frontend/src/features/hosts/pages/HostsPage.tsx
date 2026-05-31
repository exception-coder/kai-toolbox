import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Pencil,
  Plus,
  Server,
  Wifi,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import {
  createHost,
  deleteHost,
  listHosts,
  testHostPayload,
  testSavedHost,
  updateHost,
} from '../api'
import type { HostPayload, HostView } from '../types'
import { HostEditor } from '../components/HostEditor'

const EMPTY_FORM: HostPayload = {
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authType: 'PASSWORD',
  privateKey: '',
  password: '',
  passphrase: '',
  tag: '',
  note: '',
}

interface TestState {
  hostId: string
  ok: boolean
  message: string
}

export function HostsPage() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HostPayload>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState | null>(null)

  const hostsQuery = useQuery({ queryKey: ['hosts'], queryFn: listHosts })
  const hosts = hostsQuery.data ?? []

  const tags = useMemo(() => {
    const set = new Set<string>()
    hosts.forEach(h => h.tag && set.add(h.tag))
    return Array.from(set).sort()
  }, [hosts])

  const saveMutation = useMutation({
    mutationFn: (payload: HostPayload) =>
      editingId ? updateHost(editingId, payload) : createHost(payload),
    onMutate: () => setError(null),
    onSuccess: () => {
      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      qc.invalidateQueries({ queryKey: ['hosts'] })
    },
    onError: err => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteHost,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hosts'] }),
    onError: err => setError(toMessage(err)),
  })

  type TestInput = { id: string } | { payload: HostPayload; tempId?: string }
  const testMutation = useMutation({
    mutationFn: (input: TestInput) =>
      'id' in input ? testSavedHost(input.id) : testHostPayload(input.payload),
    onMutate: () => setError(null),
    onSuccess: (result, input) => {
      const targetId = 'id' in input ? input.id : input.tempId ?? '__form__'
      setTestState({ hostId: targetId, ok: result.ok, message: result.message })
    },
    onError: (err, input) => {
      const targetId = 'id' in input ? input.id : input.tempId ?? '__form__'
      setTestState({ hostId: targetId, ok: false, message: toMessage(err) })
    },
  })

  function startEdit(h: HostView) {
    setEditingId(h.id)
    setForm({
      name: h.name,
      host: h.host,
      port: h.port,
      username: h.username,
      authType: h.authType,
      privateKey: h.privateKey ?? '',
      password: '',
      passphrase: '',
      tag: h.tag ?? '',
      note: h.note ?? '',
    })
    setError(null)
    setTestState(null)
    setFormOpen(true)
  }

  function startNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setTestState(null)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" />
            主机管理
          </CardTitle>
          <CardDescription>
            统一登记 ECS / VPS / NAS 等 SSH 主机。其它工具（磁盘扫描、frp 配置）通过下拉框选用，不再各自存一份。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" className="shadow-md" onClick={startNew}>
              <Plus />
              新增主机
            </Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {hosts.length} 台已登记
              {tags.length > 0 && <> · 标签 {tags.map(t => `[${t}]`).join(' ')}</>}
            </span>
          </div>

          {formOpen && (
            <HostEditor
              value={form}
              editing={!!editingId}
              saving={saveMutation.isPending}
              testing={testMutation.isPending}
              onChange={setForm}
              onCancel={() => {
                setFormOpen(false)
                setEditingId(null)
                setForm(EMPTY_FORM)
              }}
              onSave={() => saveMutation.mutate(form)}
              onTest={() =>
                testMutation.mutate(
                  editingId
                    ? { id: editingId }
                    : { payload: form },
                )
              }
              onDelete={editingId ? () => deleteMutation.mutate(editingId) : undefined}
            />
          )}

          {testState && (
            <div
              className={
                'rounded-md border px-3 py-2 text-xs ' +
                (testState.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]')
              }
            >
              {testState.ok ? <CheckCircle2 className="mr-1 inline size-3" /> : <XCircle className="mr-1 inline size-3" />}
              {testState.ok ? '连接成功：' : '连接失败：'}
              {testState.message}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
              {error}
            </div>
          )}

          {hosts.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              还没有任何主机。点上面「新增主机」开始第一台。
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2">名称</th>
                    <th className="px-3 py-2">连接</th>
                    <th className="px-3 py-2">认证</th>
                    <th className="px-3 py-2">标签</th>
                    <th className="px-3 py-2">备注</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {hosts.map(h => (
                    <tr key={h.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{h.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{h.label}</td>
                      <td className="px-3 py-2 text-xs">
                        <Badge variant={h.authType === 'KEY' ? 'secondary' : 'outline'}>
                          {h.authType === 'KEY' ? '密钥' : '密码'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {h.tag ? <Badge variant="outline">{h.tag}</Badge> : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                        {h.note ?? '-'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => testMutation.mutate({ id: h.id })}
                            disabled={testMutation.isPending}
                          >
                            <Wifi />
                            测
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEdit(h)}>
                            <Pencil />
                            编辑
                          </Button>
                        </div>
                        {testState?.hostId === h.id && (
                          <div
                            className={
                              'mt-1 text-[11px] ' +
                              (testState.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-destructive)]')
                            }
                          >
                            {testState.ok ? '✓ ' : '✗ '}
                            {testState.message}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function toMessage(err: unknown) {
  return err instanceof ApiError ? err.message : String(err)
}

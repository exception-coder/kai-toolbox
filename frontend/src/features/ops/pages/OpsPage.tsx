import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, DatabaseZap, Pencil, Plus, Server } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import {
  createDatasource, createSystem, deleteDatasource, deleteSystem, listDatasources,
  listSystems, testDatasource, updateDatasource, updateSystem,
} from '../api'
import type { DatasourcePayload, DatasourceView, SystemPayload, SystemView, TestResult } from '../types'
import { Segmented } from '@/components/ui/segmented'
import { SystemEditor } from '../components/SystemEditor'
import { DatasourceEditor } from '../components/DatasourceEditor'
import { SqlConsole } from '../components/SqlConsole'
import { RedisConsole } from '../components/RedisConsole'
import { HistoryPanel } from '../components/HistoryPanel'
import { DatasourceRow } from '../components/DatasourceRow'
import { TYPE_DEFAULT_PORT, TYPE_META, envBadge } from '../meta'

const EMPTY_SYSTEM: SystemPayload = { name: '', code: '', owner: '', description: '' }

function emptyDatasource(systemId: string): DatasourcePayload {
  return { systemId, env: 'DEV', type: 'MYSQL', name: '', host: '', port: TYPE_DEFAULT_PORT.MYSQL,
    username: '', password: '', dbName: '', params: '', note: '' }
}

export function OpsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()

  const systemsQuery = useQuery({ queryKey: ['ops', 'systems'], queryFn: listSystems })
  const dsQuery = useQuery({ queryKey: ['ops', 'datasources'], queryFn: () => listDatasources() })
  const systems = systemsQuery.data ?? []
  const datasources = dsQuery.data ?? []

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'query' | 'history'>('query')
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<(TestResult & { dsId: string }) | null>(null)

  const [sysOpen, setSysOpen] = useState(false)
  const [sysEditId, setSysEditId] = useState<string | null>(null)
  const [sysForm, setSysForm] = useState<SystemPayload>(EMPTY_SYSTEM)

  const [dsOpen, setDsOpen] = useState(false)
  const [dsEditId, setDsEditId] = useState<string | null>(null)
  const [dsForm, setDsForm] = useState<DatasourcePayload>(emptyDatasource(''))

  const bySystem = useMemo(() => {
    const map = new Map<string, DatasourceView[]>()
    datasources.forEach(d => {
      const arr = map.get(d.systemId) ?? []
      arr.push(d)
      map.set(d.systemId, arr)
    })
    return map
  }, [datasources])

  const selected = datasources.find(d => d.id === selectedId) ?? null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ops', 'systems'] })
    qc.invalidateQueries({ queryKey: ['ops', 'datasources'] })
  }

  const saveSystem = useMutation({
    mutationFn: (p: SystemPayload) => (sysEditId ? updateSystem(sysEditId, p) : createSystem(p)),
    onMutate: () => setError(null),
    onSuccess: () => { closeSystem(); invalidate() },
    onError: e => setError(msg(e)),
  })
  const removeSystem = useMutation({
    mutationFn: deleteSystem,
    onSuccess: () => { closeSystem(); invalidate() },
    onError: e => setError(msg(e)),
  })
  const saveDs = useMutation({
    mutationFn: (p: DatasourcePayload) => (dsEditId ? updateDatasource(dsEditId, p) : createDatasource(p)),
    onMutate: () => setError(null),
    onSuccess: () => { closeDs(); invalidate() },
    onError: e => setError(msg(e)),
  })
  const removeDs = useMutation({
    mutationFn: deleteDatasource,
    onSuccess: (_r, id) => { if (selectedId === id) setSelectedId(null); closeDs(); invalidate() },
    onError: e => setError(msg(e)),
  })
  const testDs = useMutation({
    mutationFn: testDatasource,
    onMutate: () => setError(null),
    onSuccess: (r, id) => setTest({ ...r, dsId: id }),
    onError: (e, id) => setTest({ ok: false, message: msg(e), elapsedMs: 0, dsId: id }),
  })

  function startNewSystem() {
    setSysEditId(null); setSysForm(EMPTY_SYSTEM); setError(null); setSysOpen(true)
  }
  function startEditSystem(s: SystemView) {
    setSysEditId(s.id)
    setSysForm({ name: s.name, code: s.code ?? '', owner: s.owner ?? '', description: s.description ?? '' })
    setError(null); setSysOpen(true)
  }
  function closeSystem() { setSysOpen(false); setSysEditId(null); setSysForm(EMPTY_SYSTEM) }

  function startNewDs(systemId: string) {
    setDsEditId(null); setDsForm(emptyDatasource(systemId)); setError(null); setDsOpen(true)
  }
  function startEditDs(d: DatasourceView) {
    setDsEditId(d.id)
    setDsForm({
      systemId: d.systemId, env: d.env, type: d.type, name: d.name, host: d.host, port: d.port,
      username: d.username ?? '', password: '', dbName: d.dbName ?? '', params: d.params ?? '', note: d.note ?? '',
    })
    setError(null); setDsOpen(true)
  }
  function closeDs() { setDsOpen(false); setDsEditId(null) }

  async function confirmRemoveSystem() {
    if (!sysEditId) return
    const ok = await confirm({
      variant: 'destructive', title: '删除系统',
      description: '将同时删除该系统下所有中间件实例及其查询历史，不可恢复。确认删除？',
      confirmText: '删除',
    })
    if (ok) removeSystem.mutate(sysEditId)
  }
  async function confirmRemoveDs() {
    if (!dsEditId) return
    const ok = await confirm({
      variant: 'destructive', title: '删除实例',
      description: '将删除该中间件实例及其查询历史，不可恢复。确认删除？',
      confirmText: '删除',
    })
    if (ok) removeDs.mutate(dsEditId)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="size-5" />
            系统与中间件
          </CardTitle>
          <CardDescription>
            登记你负责的系统与各环境中间件（MySQL / Oracle / Redis），点击实例即可直连执行查询，日常排查一步到位。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={startNewSystem}>
              <Plus />
              新增系统
            </Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {systems.length} 个系统 · {datasources.length} 个中间件实例
            </span>
          </div>
          {sysOpen && (
            <SystemEditor
              value={sysForm}
              editing={!!sysEditId}
              saving={saveSystem.isPending}
              onChange={setSysForm}
              onCancel={closeSystem}
              onSave={() => saveSystem.mutate(sysForm)}
              onDelete={confirmRemoveSystem}
            />
          )}
          {error && (
            <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)] whitespace-pre-wrap">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="space-y-3">
          {systems.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              还没有系统。点上面「新增系统」开始登记。
            </div>
          ) : (
            systems.map(sys => {
              const list = bySystem.get(sys.id) ?? []
              const isCollapsed = collapsed[sys.id]
              return (
                <Card key={sys.id}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCollapsed(c => ({ ...c, [sys.id]: !c[sys.id] }))}
                        className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      >
                        {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                      <Server className="size-4 text-[var(--color-muted-foreground)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {sys.name}
                          {sys.code && <span className="ml-1 text-xs font-normal text-[var(--color-muted-foreground)]">{sys.code}</span>}
                        </div>
                        {sys.owner && <div className="text-xs text-[var(--color-muted-foreground)]">负责人 {sys.owner}</div>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEditSystem(sys)}>
                        <Pencil />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startNewDs(sys.id)}>
                        <Plus />
                      </Button>
                    </div>
                    {!isCollapsed && (
                      <div className="space-y-1 pl-6">
                        {list.length === 0 ? (
                          <div className="py-1 text-xs text-[var(--color-muted-foreground)]">
                            暂无中间件，点右上 + 添加
                          </div>
                        ) : (
                          list.map(d => (
                            <DatasourceRow
                              key={d.id}
                              d={d}
                              selected={selectedId === d.id}
                              testing={testDs.isPending}
                              onOpen={() => { if (d.queryable) { setSelectedId(d.id); setPanel('query') } }}
                              onTest={() => testDs.mutate(d.id)}
                              onEdit={() => startEditDs(d)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
          {test && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                test.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
              )}
            >
              {test.ok ? '✓ 连接成功：' : '✗ 连接失败：'}{test.message}
              {test.ok && ` · ${test.elapsedMs}ms`}
            </div>
          )}
        </div>

        <Card className="min-h-[420px]">
          <CardContent className="flex h-full flex-col p-4">
            {dsOpen ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold">
                  {dsEditId ? '编辑中间件实例' : '新增中间件实例'}
                </div>
                <DatasourceEditor
                  value={dsForm}
                  editing={!!dsEditId}
                  saving={saveDs.isPending}
                  testing={testDs.isPending}
                  onChange={setDsForm}
                  onCancel={closeDs}
                  onSave={() => saveDs.mutate(dsForm)}
                  onTest={dsEditId ? () => testDs.mutate(dsEditId) : undefined}
                  onDelete={confirmRemoveDs}
                />
              </div>
            ) : selected ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', envBadge(selected.env))}>
                    {selected.env}
                  </span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', TYPE_META[selected.type].badge)}>
                    {TYPE_META[selected.type].label}
                  </span>
                  <span className="text-sm font-semibold">{selected.name}</span>
                  <span className="font-mono text-xs text-[var(--color-muted-foreground)]">{selected.endpoint}</span>
                  <Segmented
                    className="ml-auto"
                    value={panel}
                    onChange={setPanel}
                    options={[{ value: 'query', label: '查询' }, { value: 'history', label: '历史' }]}
                  />
                </div>
                {panel === 'history' ? (
                  <HistoryPanel datasource={selected} />
                ) : selected.category === 'SQL' ? (
                  <SqlConsole datasource={selected} />
                ) : selected.category === 'REDIS' ? (
                  <RedisConsole datasource={selected} />
                ) : (
                  <div className="text-sm text-[var(--color-muted-foreground)]">该类型暂未支持在线查询。</div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-[var(--color-muted-foreground)]">
                <div>
                  <DatabaseZap className="mx-auto mb-2 size-6 opacity-50" />
                  从左侧点选一个中间件实例，打开查询控制台。
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function msg(e: unknown) {
  return e instanceof ApiError ? e.message : String(e)
}

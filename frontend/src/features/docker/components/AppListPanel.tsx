import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { createApp, deleteApp, scanApps } from '../api'
import type { DockerAppPayload, DockerAppView, ScannedAppView } from '../types'

interface Props {
  hostId: string
  apps: DockerAppView[]
  currentAppId: string | null
  onSelect: (id: string | null) => void
  onRefresh: () => void
}

const EMPTY_FORM: DockerAppPayload = {
  name: '',
  baseDir: '',
  composeFile: 'docker-compose.yml',
  note: '',
  skipValidate: false,
}

export function AppListPanel({ hostId, apps, currentAppId, onSelect, onRefresh }: Props) {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanDir, setScanDir] = useState('/opt/dockerApps')
  const [scanResult, setScanResult] = useState<ScannedAppView[] | null>(null)
  const [form, setForm] = useState<DockerAppPayload>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (payload: DockerAppPayload) => createApp(hostId, payload),
    onSuccess: () => {
      setCreating(false)
      setForm(EMPTY_FORM)
      setError(null)
      qc.invalidateQueries({ queryKey: ['docker', 'apps', hostId] })
    },
    onError: e => setError(toMsg(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteApp(hostId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docker', 'apps', hostId] }),
  })

  const scanMutation = useMutation({
    mutationFn: () => scanApps(hostId, scanDir.trim(), 3),
    onSuccess: data => {
      setScanResult(data.items)
      setError(null)
    },
    onError: e => setError(toMsg(e)),
  })

  function registerScanned(item: ScannedAppView) {
    createMutation.mutate({
      name: item.name,
      baseDir: item.baseDir,
      composeFile: item.composeFile,
      note: undefined,
      skipValidate: true,
    })
  }

  return (
    <Card className="self-start">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">登记应用</CardTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onRefresh} title="刷新">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setScanOpen(o => !o); setScanResult(null) }} title="扫描登记">
            <Search className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(c => !c); setError(null) }} title="新增">
            <Plus className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex flex-col gap-1.5">
        {error && (
          <div className="text-xs text-red-500 border border-red-300 rounded px-2 py-1">{error}</div>
        )}

        {creating && (
          <div className="flex flex-col gap-1.5 border rounded p-2 bg-[var(--color-muted)]/30">
            <Input placeholder="应用名" value={form.name}
                   onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="baseDir 绝对路径，如 /opt/dockerApps/nginx"
                   value={form.baseDir}
                   onChange={e => setForm({ ...form, baseDir: e.target.value })} />
            <Input placeholder="compose 文件名（默认 docker-compose.yml）"
                   value={form.composeFile ?? ''}
                   onChange={e => setForm({ ...form, composeFile: e.target.value })} />
            <Input placeholder="备注（可选）"
                   value={form.note ?? ''}
                   onChange={e => setForm({ ...form, note: e.target.value })} />
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox"
                     checked={!!form.skipValidate}
                     onChange={e => setForm({ ...form, skipValidate: e.target.checked })} />
              跳过 compose config -q 校验
            </label>
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>取消</Button>
              <Button size="sm" disabled={createMutation.isPending}
                      onClick={() => {
                        if (!form.name.trim() || !form.baseDir.trim()) {
                          setError('应用名 / baseDir 必填')
                          return
                        }
                        createMutation.mutate(form)
                      }}>
                {createMutation.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        )}

        {scanOpen && (
          <div className="flex flex-col gap-1.5 border rounded p-2 bg-[var(--color-muted)]/30">
            <div className="flex gap-1.5">
              <Input placeholder="扫描根目录" value={scanDir}
                     onChange={e => setScanDir(e.target.value)} />
              <Button size="sm" onClick={() => scanMutation.mutate()}
                      disabled={scanMutation.isPending}>
                {scanMutation.isPending ? '扫描中…' : '扫描'}
              </Button>
            </div>
            {scanResult && (
              <div className="flex flex-col gap-1 max-h-64 overflow-auto">
                {scanResult.length === 0 && (
                  <span className="text-xs text-muted-foreground">未发现 compose 文件</span>
                )}
                {scanResult.map(item => (
                  <div key={item.baseDir}
                       className="flex items-center justify-between border-b last:border-b-0 py-1 gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.baseDir}</div>
                    </div>
                    {item.registered ? (
                      <Badge variant="secondary" className="text-[10px]">已登记</Badge>
                    ) : (
                      <Button size="sm" variant="outline"
                              onClick={() => registerScanned(item)}>
                        登记
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          className={`text-left px-2 py-1.5 rounded text-xs ${currentAppId === null ? 'bg-[var(--color-accent)] font-medium' : 'hover:bg-[var(--color-accent)]/50'}`}
          onClick={() => onSelect(null)}>
          全部容器（包含未登记的）
        </button>

        {apps.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-3 text-center">
            暂无登记应用，点上方 +、或扫描登记
          </div>
        ) : (
          apps.map(app => (
            <div key={app.id}
                 className={`flex items-center gap-1 rounded ${currentAppId === app.id ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]/50'}`}>
              <button
                className={`flex-1 min-w-0 text-left px-2 py-1.5 ${currentAppId === app.id ? 'font-medium' : ''}`}
                onClick={() => onSelect(app.id)}>
                <div className="text-xs truncate">{app.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{app.baseDir}</div>
              </button>
              <Button size="sm" variant="ghost"
                      onClick={() => {
                        if (confirm(`确认删除登记 "${app.name}"？仅删除本地记录，不影响远端容器`)) {
                          deleteMutation.mutate(app.id)
                          if (currentAppId === app.id) onSelect(null)
                        }
                      }}>
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Plus, Power, PowerOff, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { sessions as api } from '../api'

const SESSIONS_KEY = ['browser-request', 'sessions'] as const

interface Props {
  currentId: string | null
  onSelect: (id: string | null) => void
}

export function SessionList({ currentId, onSelect }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data: list = [] } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: api.list,
    refetchInterval: 5000,
  })

  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [draftEngine, setDraftEngine] = useState('') // ''=跟随全局默认

  const createMut = useMutation({
    mutationFn: () => api.create({ name: draftName.trim(), url: draftUrl.trim(), engine: draftEngine || undefined }),
    onSuccess: s => {
      qc.invalidateQueries({ queryKey: SESSIONS_KEY })
      onSelect(s.id)
      setCreating(false); setDraftName(''); setDraftUrl(''); setDraftEngine('')
    },
  })

  const openMut = useMutation({
    mutationFn: api.open,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
  const saveMut = useMutation({
    mutationFn: api.save,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
  const closeMut = useMutation({
    mutationFn: api.close,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
  const deleteMut = useMutation({
    mutationFn: api.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SESSIONS_KEY })
      onSelect(null)
    },
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">会话</div>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            新建
          </Button>
        </div>

        {creating && (
          <div className="space-y-2 rounded-md border border-dashed p-2">
            <Input
              placeholder="会话名（如「语雀」）"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
            />
            <Input
              placeholder="起始 URL（如 https://www.yuque.com）"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
            />
            <select
              className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
              value={draftEngine}
              onChange={e => setDraftEngine(e.target.value)}
              title="引擎：硬反爬站点（如 BOSS 直聘）选「免检测」"
            >
              <option value="">引擎：默认（跟随全局）</option>
              <option value="undetected-node">免检测 patchright（BOSS 等硬反爬站点）</option>
              <option value="playwright-java">标准 Playwright（可录制/回放）</option>
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!draftName.trim() || !draftUrl.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                创建并打开
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {list.length === 0 && !creating && (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
            还没有会话。点「新建」开始第一条。
          </div>
        )}

        <ul className="space-y-1">
          {list.map(s => (
            <li
              key={s.id}
              className={`rounded-md border p-2 text-sm ${
                s.id === currentId ? 'border-blue-500 ring-1 ring-blue-500/40' : ''
              }`}
            >
              <button
                onClick={() => onSelect(s.id)}
                className="block w-full min-w-0 text-left"
              >
                <div className="truncate font-medium">{s.name}</div>
                <div className="truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  {s.url}
                </div>
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                  s.active
                    ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                    : 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
                }`}
                title={s.active ? '浏览器窗口已打开' : '未打开'}
              >
                {s.active ? '在线' : '离线'}
              </span>
              {s.hasStorage && (
                <span
                  className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300"
                  title="已保存登录态"
                >
                  已登录
                </span>
              )}
              {s.engine === 'undetected-node' && (
                <span
                  className="shrink-0 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-700 dark:text-purple-300"
                  title="免检测引擎 patchright（用于硬反爬站点）"
                >
                  免检测
                </span>
              )}
              <div className="flex shrink-0 flex-wrap gap-1">
                {!s.active && (
                  <Button size="sm" variant="ghost" onClick={() => openMut.mutate(s.id)} title="打开浏览器">
                    <Power className="size-4" />
                  </Button>
                )}
                {s.active && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="查看当前页签 URL（确认窗口停在哪）"
                      onClick={async () => {
                        try {
                          const urls = await api.pages(s.id)
                          await confirm({
                            title: '当前页签 URL',
                            description: (
                              <div className="max-h-60 space-y-1 overflow-auto break-all font-mono text-xs">
                                {urls.length
                                  ? urls.map((u, i) => <div key={i}>{i + 1}. {u}</div>)
                                  : '（浏览器当前没有打开的页签）'}
                              </div>
                            ),
                            confirmText: '知道了',
                          })
                        } catch (e) {
                          await confirm({
                            title: '获取失败',
                            description: e instanceof Error ? e.message : String(e),
                            confirmText: '关闭',
                          })
                        }
                      }}
                    >
                      <Globe className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => saveMut.mutate(s.id)} title="保存登录态">
                      <Save className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => closeMut.mutate(s.id)} title="关闭浏览器">
                      <PowerOff className="size-4" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除会话',
                      description: `「${s.name}」会被删除，包括所有录制和任务。不可恢复。`,
                      variant: 'destructive',
                      confirmText: '删除',
                    })
                    if (ok) deleteMut.mutate(s.id)
                  }}
                  title="删除"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

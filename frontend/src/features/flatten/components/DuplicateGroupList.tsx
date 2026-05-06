import { useMemo, useState } from 'react'
import { Trash2, AlertTriangle, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatBytes, formatDate, formatNumber } from '@/lib/utils'
import type { DuplicateGroup } from '../types'

interface DuplicateGroupListProps {
  groups: DuplicateGroup[]
  onConfirmDelete: (keepPaths: string[]) => void
  onSkip: () => void
  busy?: boolean
}

export function DuplicateGroupList({ groups, onConfirmDelete, onSkip, busy }: DuplicateGroupListProps) {
  const confirm = useConfirm()
  // 默认保留每组第一个（mock 已按路径长度/字典序排好；视为"路径最短/最早"启发式）
  const [keep, setKeep] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map(g => [g.hash, g.files[0].path])),
  )

  const totalToDelete = useMemo(
    () => groups.reduce((acc, g) => acc + (g.files.length - 1), 0),
    [groups],
  )
  const totalFreed = useMemo(
    () => groups.reduce((acc, g) => acc + g.size * (g.files.length - 1), 0),
    [groups],
  )

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">未发现重复文件</CardTitle>
          <CardDescription>所有文件内容互不相同，可直接进入迁移步骤。</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 pt-0">
          <Button onClick={onSkip} disabled={busy}>
            <SkipForward className="mr-1 h-4 w-4" />
            进入迁移
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          发现 {groups.length} 组重复文件
        </CardTitle>
        <CardDescription>
          每组选择一个保留项；其余将从源目录删除。预计删除 {formatNumber(totalToDelete)} 个文件，释放 {formatBytes(totalFreed)}。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <ul className="divide-y rounded-md border">
          {groups.map(g => (
            <li key={g.hash} className="space-y-2 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium tabular-nums">
                  {g.files.length} 个文件 · 单个 {formatBytes(g.size)}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {g.hash}
                </Badge>
              </div>
              <ul className="space-y-1.5">
                {g.files.map(f => {
                  const isKept = keep[g.hash] === f.path
                  return (
                    <li
                      key={f.path}
                      className="flex items-center gap-3 rounded-md border bg-[var(--color-background)] px-3 py-1.5 text-xs"
                    >
                      <input
                        type="radio"
                        name={`keep-${g.hash}`}
                        checked={isKept}
                        onChange={() => setKeep(k => ({ ...k, [g.hash]: f.path }))}
                        className="h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="flex-1 truncate font-mono" title={f.path}>
                        {f.path}
                      </span>
                      <span className="shrink-0 text-[var(--color-muted-foreground)]">
                        {formatDate(f.modifiedAt)}
                      </span>
                      {isKept ? (
                        <Badge variant="success" className="shrink-0">保留</Badge>
                      ) : (
                        <Badge variant="destructive" className="shrink-0">删除</Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onSkip} disabled={busy}>
            <SkipForward className="mr-1 h-4 w-4" />
            跳过去重
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              const list = Object.values(keep)
              const ok = await confirm({
                title: '删除重复文件',
                description: `将删除 ${formatNumber(totalToDelete)} 个重复文件，释放 ${formatBytes(totalFreed)}。此操作不可撤销。`,
                confirmText: '确认删除',
                variant: 'destructive',
              })
              if (!ok) return
              onConfirmDelete(list)
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            删除 {totalToDelete} 个重复文件
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

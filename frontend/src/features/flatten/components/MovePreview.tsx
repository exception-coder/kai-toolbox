import { ArrowRight, FileWarning, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { MovePlanItem } from '../types'

interface MovePreviewProps {
  targetPath: string
  plan: MovePlanItem[]
  onStart: () => void
  busy?: boolean
}

export function MovePreview({ targetPath, plan, onStart, busy }: MovePreviewProps) {
  const confirm = useConfirm()
  const conflicts = plan.filter(p => p.conflict).length
  const totalSize = plan.reduce((acc, p) => acc + p.size, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FolderInput className="h-4 w-4" />
          迁移预览 → <span className="font-mono text-xs text-[var(--color-muted-foreground)]">{targetPath}</span>
        </CardTitle>
        <CardDescription>
          将平铺 {formatNumber(plan.length)} 个文件 / {formatBytes(totalSize)}
          {conflicts > 0 && (
            <>
              {' · '}
              <span className="text-amber-600 dark:text-amber-400">
                {conflicts} 个文件名冲突，将自动追加 +1/+2 序号
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-secondary)]/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">源路径</th>
                <th className="px-3 py-2 font-medium">→ 目标文件名</th>
                <th className="px-3 py-2 text-right font-medium">大小</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p, i) => (
                <tr key={p.sourcePath} className={i % 2 === 0 ? '' : 'bg-[var(--color-secondary)]/20'}>
                  <td className="truncate px-3 py-1.5 font-mono" title={p.sourcePath}>
                    {p.sourcePath}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                      <span className="truncate font-mono">{p.targetName}</span>
                      {p.conflict && (
                        <Badge variant="secondary" className="shrink-0 gap-1 px-1.5 py-0 text-[10px]">
                          <FileWarning className="h-3 w-3" />
                          已重命名
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-muted-foreground)]">
                    {formatBytes(p.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end">
          <Button
            disabled={busy || plan.length === 0}
            onClick={async () => {
              const ok = await confirm({
                title: '开始迁移',
                description: (
                  <>
                    将 {formatNumber(plan.length)} 个文件 / {formatBytes(totalSize)} 移动到{' '}
                    <span className="font-mono">{targetPath}</span>。此操作不可撤销。
                  </>
                ),
                confirmText: '开始迁移',
              })
              if (!ok) return
              onStart()
            }}
          >
            <FolderInput className="mr-1 h-4 w-4" />
            开始迁移
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

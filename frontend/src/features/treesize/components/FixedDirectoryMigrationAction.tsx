import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, CheckCircle2, HardDrive, Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import {
  listFixedDirectoryMigrations,
  migrateFixedDirectory,
  type FixedDirectoryMigrationView,
} from '../api'

export function FixedDirectoryMigrationAction({ recipeId }: { recipeId: string }) {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [targetPath, setTargetPath] = useState('D:\\ClaudeVM\\vm_bundles')
  const [result, setResult] = useState<FixedDirectoryMigrationView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const migrations = useQuery({
    queryKey: ['fixed-directory-migrations'],
    queryFn: listFixedDirectoryMigrations,
    staleTime: 0,
  })
  const migration = migrations.data?.find(item => item.recipeId === recipeId)

  const execute = useMutation({
    mutationFn: async () => {
      if (!migration) throw new Error('未找到对应迁移能力')
      const accepted = await confirm({
        title: '确认迁移固定软件目录？',
        description:
          `请先完全退出 Claude Desktop。\n\n` +
          `源目录：${migration.sourcePath}\n目标目录：${targetPath}\n\n` +
          '系统将复制并校验全部文件，再把源目录替换为 Junction。成功后原目录备份暂时保留，不会自动删除。',
        confirmText: '开始迁移',
        variant: 'destructive',
      })
      if (!accepted) throw new CancelledMigration()
      return migrateFixedDirectory(migration.migrationId, targetPath.trim())
    },
    onSuccess: async data => {
      setResult(data)
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fixed-directory-migrations'] }),
        queryClient.invalidateQueries({ queryKey: ['devclean-probe'] }),
      ])
    },
    onError: errorValue => {
      if (errorValue instanceof CancelledMigration) return
      setError(errorValue instanceof ApiError ? errorValue.message : String(errorValue))
    },
  })

  if (migrations.isLoading || !migration) return null

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => setOpen(value => !value)}
        disabled={migration.alreadyLinked}
      >
        {migration.alreadyLinked ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" />
        ) : (
          <ArrowRightLeft className="h-3.5 w-3.5" />
        )}
        {migration.alreadyLinked ? '已迁移到其他磁盘' : '迁移到其他磁盘'}
      </Button>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/[0.035] p-3">
          <div className="flex items-start gap-2">
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">复制 → Junction → 校验</div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                当前约 {formatBytes(migration.estimatedBytes)}。迁移期间源目录保持不动，复制校验通过后才切换。
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={targetPath}
                  onChange={event => setTargetPath(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 font-mono text-xs outline-none focus:border-[var(--color-primary)]"
                  placeholder="D:\ClaudeVM\vm_bundles"
                  disabled={execute.isPending}
                />
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => execute.mutate()}
                  disabled={execute.isPending || !targetPath.trim() || !migration.available}
                >
                  {execute.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {execute.isPending ? '正在迁移…' : '复制并创建联接'}
                </Button>
              </div>
              <p className="mt-2 flex items-start gap-1 text-[11px] text-[var(--color-warning)]">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                目标必须在其他本地磁盘且不存在；迁移期间不要启动 Claude Desktop。
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[var(--color-destructive)]">{error}</p>}
      {result && (
        <div className="mt-2 rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-2 text-xs">
          <div className="font-medium text-[var(--color-success)]">Junction 已校验通过</div>
          <div className="mt-1 text-[var(--color-muted-foreground)]">
            已复制 {formatNumber(result.copiedFiles)} 个文件，共 {formatBytes(result.copiedBytes)}
          </div>
          <div className="mt-1 break-all font-mono text-[11px]">备份：{result.backupPath}</div>
        </div>
      )}
    </div>
  )
}

class CancelledMigration extends Error {}

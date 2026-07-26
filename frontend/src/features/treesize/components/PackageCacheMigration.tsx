import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FolderCog, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import {
  configurePackageCache,
  listPackageCaches,
  type PackageCacheView,
} from '../api'

/**
 * 每个包管理器按自身原生配置语义切换缓存目录，旧缓存仍由清理配方单独核对。
 */
export function PackageCacheMigration() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [result, setResult] = useState<PackageCacheView | null>(null)

  const caches = useQuery({
    queryKey: ['devclean-package-caches'],
    queryFn: listPackageCaches,
  })

  useEffect(() => {
    if (!caches.data) return
    setTargets(current => {
      const next = { ...current }
      caches.data.forEach(cache => {
        if (!(cache.managerId in next)) next[cache.managerId] = suggestedPath(cache)
      })
      return next
    })
  }, [caches.data])

  const configure = useMutation({
    mutationFn: ({ managerId, targetPath }: { managerId: string; targetPath: string }) =>
      configurePackageCache(managerId, targetPath),
    onSuccess: async data => {
      setResult(data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['devclean-package-caches'] }),
        queryClient.invalidateQueries({ queryKey: ['devclean-probe'] }),
      ])
    },
  })

  const applyConfiguration = async (cache: PackageCacheView) => {
    const targetPath = targets[cache.managerId]?.trim() ?? ''
    const ok = await confirm({
      title: `切换 ${cache.displayName} 缓存配置？`,
      description:
        `配置方式：${cache.configurationMethod}\n`
        + `配置键：${cache.configurationKey}\n`
        + `当前目录：${cache.currentPath}\n`
        + `目标目录：${targetPath}\n\n`
        + '只切换未来缓存位置，不复制、不删除旧目录；配置文件写入前会备份。',
      confirmText: '确认切换配置',
      cancelText: '取消',
    })
    if (ok) configure.mutate({ managerId: cache.managerId, targetPath })
  }

  const error = caches.error ?? configure.error

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FolderCog className="h-4 w-4" />
          包管理器原生缓存配置
        </CardTitle>
        <CardDescription>
          npm、pip、Maven 分别按自己的用户配置格式处理。请为每个工具填写精确目标目录，
          旧缓存不会自动搬走或删除。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {caches.isLoading && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取各工具原生配置…
          </div>
        )}

        {caches.data && (
          <div className="grid gap-3 lg:grid-cols-3">
            {caches.data.map(cache => {
              const migrated = normalizePath(cache.currentPath) !== normalizePath(cache.defaultPath)
              const pending = configure.isPending && configure.variables?.managerId === cache.managerId
              const targetPath = targets[cache.managerId] ?? ''
              return (
                <section key={cache.managerId} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{cache.displayName}</span>
                    <Badge variant={migrated ? 'success' : 'secondary'}>
                      {migrated ? '已自定义' : '默认目录'}
                    </Badge>
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <ConfigRow label="配置方式" value={cache.configurationMethod} />
                    <ConfigRow label="配置键" value={cache.configurationKey} />
                    <ConfigRow label="当前目录" value={cache.currentPath} mono />
                  </dl>

                  <Input
                    value={targetPath}
                    onChange={event =>
                      setTargets(current => ({ ...current, [cache.managerId]: event.target.value }))
                    }
                    placeholder={suggestedPath(cache)}
                    aria-label={`${cache.displayName} 缓存目标目录`}
                  />

                  <div className="rounded-md bg-[var(--color-muted)]/35 px-2.5 py-2 text-[11px]">
                    <div className="text-[var(--color-muted-foreground)]">切换后验证</div>
                    <code className="mt-1 block break-all">{cache.verificationCommand}</code>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={!targetPath.trim() || !cache.migrationSupported || configure.isPending}
                    onClick={() => applyConfiguration(cache)}
                  >
                    {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {migrated ? '切换到新目录' : '写入原生配置'}
                  </Button>

                  <p
                    className={`text-[11px] leading-relaxed ${
                      cache.migrationSupported
                        ? 'text-[var(--color-muted-foreground)]'
                        : 'text-[var(--color-destructive)]'
                    }`}
                  >
                    {cache.migrationSupported ? cache.cleanupHint : cache.message}
                  </p>
                </section>
              )
            })}
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-medium">
                {result.displayName} 已按 {result.configurationMethod} 切换到 {result.currentPath}
              </div>
              <div className="mt-1 text-[var(--color-muted-foreground)]">
                {result.message}
                {result.backupPath && ` 备份：${result.backupPath}`}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-[var(--color-destructive)]">
            读取或配置失败：{error instanceof ApiError ? error.message : String(error)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConfigRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className={`break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function suggestedPath(cache: PackageCacheView) {
  const folder = {
    npm: 'npm-cache',
    pip: 'pip-cache',
    maven: 'maven-repository',
  }[cache.managerId]
  return `D:\\DevCaches\\${folder}`
}

function normalizePath(path: string) {
  return path.replaceAll('/', '\\').replace(/\\+$/, '').toLocaleLowerCase()
}

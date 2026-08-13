import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, DatabaseZap, Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  deleteRedisKeysByPatterns,
  listOpsDatasources,
  listOpsSystems,
  type RedisKeyDeleteResult,
} from '../api'

const MENU_CACHE_PATTERNS = [
  'system_menu:*',
  'menu_role_ids:*',
  'permission_menu_ids:*',
] as const

function isSrmSystem(name: string, code: string | null) {
  return code?.trim().toLowerCase().includes('srm') === true || name.toLowerCase().includes('srm')
}

function isProductionEnvironment(env: string) {
  const normalized = env.trim().toLowerCase()
  return ['prod', 'production', '生产', '正式'].some(keyword => normalized.includes(keyword))
}

/** SRM 开发快捷操作：通过系统中间件台安全清理菜单相关 Redis 缓存。 */
export function SrmMenuCacheResetSection() {
  const confirm = useConfirm()
  const [systemId, setSystemId] = useState('')
  const [datasourceId, setDatasourceId] = useState('')
  const [result, setResult] = useState<RedisKeyDeleteResult | null>(null)

  const systemsQuery = useQuery({
    queryKey: ['ops-systems'],
    queryFn: listOpsSystems,
    staleTime: 10_000,
  })
  const systemOptions = useMemo(() => {
    const systems = systemsQuery.data ?? []
    return systems.filter(system => isSrmSystem(system.name, system.code))
  }, [systemsQuery.data])

  useEffect(() => {
    if (systemOptions.length === 0) {
      setSystemId('')
      return
    }
    if (!systemOptions.some(system => system.id === systemId)) {
      setSystemId(systemOptions[0].id)
    }
  }, [systemId, systemOptions])

  const datasourcesQuery = useQuery({
    queryKey: ['ops-datasources', systemId],
    queryFn: () => listOpsDatasources(systemId),
    enabled: Boolean(systemId),
    staleTime: 5_000,
  })
  const redisDatasources = useMemo(
    () => (datasourcesQuery.data ?? []).filter(datasource =>
      datasource.type.toUpperCase() === 'REDIS' && !isProductionEnvironment(datasource.env)),
    [datasourcesQuery.data],
  )
  const productionRedisCount = useMemo(
    () => (datasourcesQuery.data ?? []).filter(datasource =>
      datasource.type.toUpperCase() === 'REDIS' && isProductionEnvironment(datasource.env)).length,
    [datasourcesQuery.data],
  )

  useEffect(() => {
    if (!redisDatasources.some(datasource => datasource.id === datasourceId)) {
      setDatasourceId(redisDatasources[0]?.id ?? '')
    }
    setResult(null)
  }, [datasourceId, redisDatasources])

  const resetMutation = useMutation({
    mutationFn: () => deleteRedisKeysByPatterns(datasourceId, [...MENU_CACHE_PATTERNS]),
    onSuccess: setResult,
  })

  const selectedDatasource = redisDatasources.find(datasource => datasource.id === datasourceId)

  const resetMenuCache = async () => {
    if (!selectedDatasource || resetMutation.isPending) return
    const accepted = await confirm({
      title: '确认重置 SRM 菜单缓存？',
      description: (
        <span className="block space-y-2">
          <span className="block">
            目标：{selectedDatasource.env}｜{selectedDatasource.name}（{selectedDatasource.endpoint}）
          </span>
          <span className="block font-mono text-xs">{MENU_CACHE_PATTERNS.join('、')}</span>
          <span className="block">只删除以上前缀缓存，不会执行 FLUSHDB。在线用户可能需要重新登录。</span>
        </span>
      ),
      confirmText: '确认清理',
      variant: 'destructive',
    })
    if (!accepted) return
    setResult(null)
    resetMutation.mutate()
  }

  const hasSystems = systemOptions.length > 0
  const error = systemsQuery.error ?? datasourcesQuery.error ?? resetMutation.error

  return (
    <section className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <DatabaseZap className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">SRM 菜单缓存一键重置</h2>
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
              仅非生产环境
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">
            菜单 SQL 或角色授权变更后，清理菜单、角色菜单和权限菜单缓存；随后退出 SRM 并重新登录。
          </p>
        </div>
      </div>

      {!hasSystems && !systemsQuery.isLoading ? (
        <div className="mt-3 rounded-lg border border-dashed p-3 text-xs text-[var(--color-muted-foreground)]">
          尚未登记 SRM 系统与 Redis 数据源。
          <Button asChild variant="link" size="sm" className="h-auto px-1">
            <Link to="/tools/ops">前往系统与中间件配置</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--color-muted-foreground)]">
            SRM 系统
            <select
              value={systemId}
              onChange={event => {
                setSystemId(event.target.value)
                setDatasourceId('')
                setResult(null)
              }}
              disabled={systemsQuery.isLoading}
              className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
            >
              {systemOptions.map(system => (
                <option key={system.id} value={system.id}>
                  {system.name}{system.code ? `（${system.code}）` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--color-muted-foreground)]">
            Redis 数据源
            <select
              value={datasourceId}
              onChange={event => {
                setDatasourceId(event.target.value)
                setResult(null)
              }}
              disabled={!systemId || datasourcesQuery.isLoading || redisDatasources.length === 0}
              className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
            >
              <option value="">{datasourcesQuery.isLoading ? '加载中…' : '选择非生产 Redis…'}</option>
              {redisDatasources.map(datasource => (
                <option key={datasource.id} value={datasource.id}>
                  {datasource.env}｜{datasource.name}（{datasource.endpoint} / db {datasource.dbName ?? '0'}）
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {hasSystems && !datasourcesQuery.isLoading && redisDatasources.length === 0 && (
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
          当前 SRM 系统没有可用的非生产 Redis 数据源，请先在
          <Link to="/tools/ops" className="mx-1 text-[var(--color-primary)] hover:underline">系统与中间件</Link>
          中登记。
        </p>
      )}
      {productionRedisCount > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <ShieldAlert className="size-3.5" />已隐藏 {productionRedisCount} 个生产环境 Redis，开发快捷操作不可选择。
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={resetMenuCache}
          disabled={!selectedDatasource || resetMutation.isPending}
        >
          {resetMutation.isPending ? <Loader2 className="animate-spin" /> : <DatabaseZap />}
          {resetMutation.isPending ? '正在清理…' : '一键重置菜单缓存'}
        </Button>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">
          固定清理 3 类缓存，不会清空整个 Redis DB。
        </span>
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />已删除 {result.totalDeleted} 个缓存键，耗时 {result.elapsedMs} ms
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.patterns.map(item => (
              <span key={item.pattern} className="rounded border bg-[var(--color-background)] px-2 py-1 font-mono text-[10px]">
                {item.pattern} · {item.deleted}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            请退出并重新登录 SRM，再执行一次浏览器强制刷新。
          </p>
        </div>
      )}
      {error && (
        <p className="mt-3 text-xs text-[var(--color-destructive)]">
          清理失败：{error instanceof Error ? error.message : '未知错误'}
        </p>
      )}
    </section>
  )
}

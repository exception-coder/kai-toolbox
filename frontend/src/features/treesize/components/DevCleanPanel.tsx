import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import {
  executeDevClean,
  getDevCleanCapability,
  probeDevClean,
  type DevCleanExecuteResult,
  type DevCleanRecipe,
  type RecipeSafety,
} from '../api'

/**
 * 开发机清理面板。
 *
 * 与「空间扫描」页签的关系：那边是先扫未知目录再从结果里推断候选，这边的目标是先验已知的
 * （VS Code 插件历史版本、各类 Cache、包管理器缓存），不需要扫描即可直接测量。
 *
 * 交互是两段式的 —— 先 probe 出每项的真实占用，用户再勾选执行。不提供「全选」按钮：
 * 这个清单里既有可重建的缓存，也有清掉就要重建索引/重下依赖的项，一键全选会让代价不可见。
 */
export function DevCleanPanel() {
  const confirm = useConfirm()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<DevCleanExecuteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const capability = useQuery({
    queryKey: ['devclean-capability'],
    queryFn: getDevCleanCapability,
    staleTime: Infinity,
  })

  const probe = useQuery({
    queryKey: ['devclean-probe'],
    queryFn: probeDevClean,
    // 体积是磁盘的即时状态，缓存久了会拿旧数字骗人；每次进页签重新量。
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const recipes = probe.data ?? []

  // 执行完体积就变了，已勾选项也已消失 —— 清掉选择，避免二次点击对着旧数字空跑。
  useEffect(() => {
    if (result) setSelected(new Set())
  }, [result])

  const cleanable = useMemo(
    () => recipes.filter(r => r.kind !== 'ADVISORY' && r.available),
    [recipes],
  )
  const advisories = useMemo(() => recipes.filter(r => r.kind === 'ADVISORY'), [recipes])
  const unavailable = useMemo(
    () => recipes.filter(r => r.kind !== 'ADVISORY' && !r.available),
    [recipes],
  )

  const selectedRecipes = cleanable.filter(r => selected.has(r.id))
  const selectedBytes = selectedRecipes.reduce((sum, r) => sum + r.size, 0)
  const reclaimableBytes = cleanable.reduce((sum, r) => sum + r.size, 0)

  const runMutation = useMutation({
    mutationFn: (ids: string[]) => executeDevClean(ids),
    onMutate: () => {
      setError(null)
      setResult(null)
    },
    onSuccess: async data => {
      setResult(data)
      await probe.refetch()
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : String(e)),
  })

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (groupRecipes: DevCleanRecipe[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      groupRecipes.forEach(r => (on ? next.add(r.id) : next.delete(r.id)))
      return next
    })
  }

  const handleRun = async () => {
    if (selectedRecipes.length === 0) return
    const risky = selectedRecipes.filter(r => r.safety !== 'SAFE')
    const ok = await confirm({
      title: `确认清理 ${selectedRecipes.length} 项？`,
      description: [
        `预计移入回收站 ${formatBytes(selectedBytes)}，共 ${formatNumber(
          selectedRecipes.reduce((s, r) => s + r.itemCount, 0),
        )} 个文件/目录。`,
        risky.length > 0
          ? `其中 ${risky.length} 项需要重建代价：${risky.map(r => r.title).join('、')}。`
          : '',
        '所有内容先进回收站，可恢复；但磁盘空间要等清空回收站后才真正释放。',
      ]
        .filter(Boolean)
        .join('\n'),
      confirmText: '开始清理',
      cancelText: '取消',
    })
    if (ok) runMutation.mutate(selectedRecipes.map(r => r.id))
  }

  const groups = useMemo(() => groupBy(cleanable), [cleanable])
  const recycleBinBroken = capability.data && !capability.data.recycleBinAvailable

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Trash2 className="h-4 w-4" />
            开发机清理
            {probe.isFetching ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                测量中
              </Badge>
            ) : (
              <Badge variant="success">可回收 {formatBytes(reclaimableBytes)}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            按先验清单直接测量 Windows 开发机上的已知占用（IDE 缓存、包管理器缓存、临时文件），
            不需要先扫描。删除一律先进回收站。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleRun}
            disabled={selectedRecipes.length === 0 || runMutation.isPending || !!recycleBinBroken}
            className="gap-1.5"
          >
            {runMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            清理选中 {selectedRecipes.length > 0 && `（${formatBytes(selectedBytes)}）`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => probe.refetch()}
            disabled={probe.isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${probe.isFetching ? 'animate-spin' : ''}`} />
            重新测量
          </Button>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              清空选择
            </Button>
          )}
        </CardContent>
      </Card>

      {recycleBinBroken && (
        <Notice tone="danger">
          当前运行环境不支持回收站（无桌面会话），清理已禁用。本功能不提供永久删除兜底 ——
          一次点击可能涉及数 GB 且只按类别授权，永久删除的风险不对等。
        </Notice>
      )}

      {error && <Notice tone="danger">清理失败：{error}</Notice>}

      {result && <ResultSummary result={result} />}

      {probe.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在测量各项占用…
          </CardContent>
        </Card>
      )}

      {probe.isError && (
        <Notice tone="danger">
          测量失败：{probe.error instanceof ApiError ? probe.error.message : String(probe.error)}
        </Notice>
      )}

      {groups.map(([group, items]) => {
        const allOn = items.every(r => selected.has(r.id))
        const groupBytes = items.reduce((s, r) => s + r.size, 0)
        return (
          <Card key={group}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="text-sm">{group}</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
                  {formatBytes(groupBytes)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => toggleGroup(items, !allOn)}
                >
                  {allOn ? '取消本组' : '选择本组'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {items.map(recipe => (
                  <RecipeRow
                    key={recipe.id}
                    recipe={recipe}
                    checked={selected.has(recipe.id)}
                    onToggle={() => toggle(recipe.id)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}

      {advisories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4" />
              需要手动执行
            </CardTitle>
            <CardDescription>
              这些项要么必须由专用工具回收（硬链接 store、Docker 分层存储），
              要么会中断正在运行的东西。本工具只报体积和命令，不代执行。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {advisories.map(recipe => (
                <AdvisoryRow key={recipe.id} recipe={recipe} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {unavailable.length > 0 && (
        <Card>
          <CardContent className="p-4 text-xs text-[var(--color-muted-foreground)]">
            本机未安装或不存在，已跳过：{unavailable.map(r => r.title).join('、')}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RecipeRow({
  recipe,
  checked,
  onToggle,
}: {
  recipe: DevCleanRecipe
  checked: boolean
  onToggle: () => void
}) {
  const empty = recipe.itemCount === 0
  return (
    <li className="px-3 py-3 sm:px-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={empty}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)] disabled:opacity-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{recipe.title}</span>
            <SafetyBadge safety={recipe.safety} />
            {empty && <Badge variant="secondary">已是干净的</Badge>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
            {recipe.note}
          </p>
          {recipe.samplePaths.length > 0 && (
            <p
              className="mt-1 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]"
              title={recipe.samplePaths.join('\n')}
            >
              {recipe.samplePaths[0]}
              {recipe.itemCount > 1 && ` 等 ${formatNumber(recipe.itemCount)} 项`}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-sm font-medium tabular-nums">
          {formatBytes(recipe.size)}
        </div>
      </label>
    </li>
  )
}

function AdvisoryRow({ recipe }: { recipe: DevCleanRecipe }) {
  return (
    <li className="space-y-2 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{recipe.title}</span>
        <SafetyBadge safety={recipe.safety} />
        {recipe.size > 0 && (
          <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
            约 {formatBytes(recipe.size)}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">{recipe.note}</p>
      {recipe.advisoryCommand && (
        <pre className="overflow-x-auto rounded-md border bg-[var(--color-muted)]/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
          {recipe.advisoryCommand}
        </pre>
      )}
    </li>
  )
}

function ResultSummary({ result }: { result: DevCleanExecuteResult }) {
  const failedItems = result.items.filter(i => i.errors.length > 0)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-success,var(--color-primary))]" />
          清理完成
          <Badge variant="success">{formatBytes(result.freedBytes)}</Badge>
          <Badge variant="secondary">{formatNumber(result.deleted)} 项已移入回收站</Badge>
          {result.failed > 0 && <Badge variant="destructive">{result.failed} 项失败</Badge>}
        </CardTitle>
        <CardDescription>
          内容已进回收站，磁盘空间要等清空回收站后才真正释放（见「需要手动执行」里的清空回收站）。
        </CardDescription>
      </CardHeader>
      {failedItems.length > 0 && (
        <CardContent className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-destructive)]" />
            以下内容被占用而跳过，关掉对应程序后重新清理即可
          </div>
          {failedItems.map(item => (
            <div key={item.recipeId} className="rounded-md border px-3 py-2">
              <div className="text-xs font-medium">{item.title}</div>
              <ul className="mt-1 space-y-0.5">
                {item.errors.slice(0, 5).map(err => (
                  <li
                    key={err}
                    className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]"
                    title={err}
                  >
                    {err}
                  </li>
                ))}
              </ul>
              {item.errors.length > 5 && (
                <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  其余 {formatNumber(item.errors.length - 5)} 项同因被占用跳过
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

function Notice({ tone, children }: { tone: 'danger' | 'info'; children: React.ReactNode }) {
  const danger = tone === 'danger'
  return (
    <div
      className={
        danger
          ? 'flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs leading-relaxed text-[var(--color-destructive)]'
          : 'flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]'
      }
    >
      {danger ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  )
}

function SafetyBadge({ safety }: { safety: RecipeSafety }) {
  const variant = safety === 'SAFE' ? 'success' : safety === 'DANGEROUS' ? 'destructive' : 'secondary'
  const label = safety === 'SAFE' ? '可重建' : safety === 'DANGEROUS' ? '高风险' : '有重建代价'
  return <Badge variant={variant}>{label}</Badge>
}

/** 保持后端给出的组顺序（VS Code → AI 桌面端 → 包管理器 → …），不重排。 */
function groupBy(recipes: DevCleanRecipe[]): Array<[string, DevCleanRecipe[]]> {
  const map = new Map<string, DevCleanRecipe[]>()
  recipes.forEach(r => {
    const list = map.get(r.group)
    if (list) list.push(r)
    else map.set(r.group, [r])
  })
  return [...map.entries()]
}

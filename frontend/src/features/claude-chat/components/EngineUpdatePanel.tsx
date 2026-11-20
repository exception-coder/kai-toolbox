import { useEffect, useState } from 'react'
import { Check, Copy, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { getSidecarVersion } from '../api'
import type { EngineCatalogView, SidecarEngineVersion, SidecarVersion } from '../types'
import { SdkUpgradeActions } from './SdkUpgradeActions'
import { engineDependencyRows, type EngineDependencyRow } from './engineDependencyRows'

/** 兼容新旧 sidecar 版本响应，统一生成引擎卡片数据。 */
function sidecarEngines(sdk: SidecarVersion): SidecarEngineVersion[] {
  if (sdk.engines?.length) return sdk.engines
  return [{
    id: 'claude',
    name: 'Claude Code',
    packageName: '@anthropic-ai/claude-agent-sdk',
    declared: sdk.declared,
    installed: sdk.installed,
    cliVersion: sdk.cliVersion,
    latest: sdk.latest,
    outdated: sdk.outdated,
    error: sdk.error,
  }]
}

function installedVersion(engine: EngineDependencyRow) {
  return engine.version?.installed ?? engine.probe?.sdkVersion
}

/** 一句话版本结论：先说能否更新，再给版本号。 */
function versionSummary(engine: EngineDependencyRow): { text: string; tone: 'update' | 'ok' | 'muted' } {
  const installed = installedVersion(engine)
  const { version } = engine
  if (version?.outdated) return { text: `可更新 ${installed ?? '?'} → ${version.latest}`, tone: 'update' }
  if (!engine.upgradeable) return { text: engine.upgradeMode, tone: 'muted' }
  if (version?.latest) return { text: `已是最新 ${installed ?? version.latest}`, tone: 'ok' }
  return { text: installed ? `已装 ${installed}` : '未检测到版本', tone: 'muted' }
}

/** 有更新的排最前，其次可面板升级的，最后外部维护的运行时。 */
function rank(engine: EngineDependencyRow) {
  if (engine.version?.outdated) return 0
  return engine.upgradeable ? 1 : 2
}

/** 对话引擎运行时版本与升级；团队依赖面板与独立「对话引擎更新」入口共用。 */
export function EngineRuntimeSection({ catalog, autoCheck = false, confirmUpgrade }: {
  catalog?: EngineCatalogView
  /** 独立入口打开即联网检查最新版本；团队依赖面板保持只读本地版本。 */
  autoCheck?: boolean
  confirmUpgrade?: (engines: string[]) => Promise<boolean>
}) {
  const [sdk, setSdk] = useState<SidecarVersion | null>(null)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const rows = engineDependencyRows(catalog, sdk && !sdk.error ? sidecarEngines(sdk) : sdk?.engines)
    .sort((left, right) => rank(left) - rank(right))
  const outdated = rows.filter(engine => engine.upgradeable && engine.version?.outdated)

  /** check=true 才联网查 npm 最新版。 */
  const loadSdk = async (check = false) => {
    if (check) setChecking(true)
    setSdkError(null)
    try { setSdk(await getSidecarVersion(check)) } catch {
      setSdkError('版本读取失败，请重新检查。')
    } finally { setChecking(false) }
  }

  useEffect(() => { void loadSdk(autoCheck) }, [autoCheck])

  const copyUpgrade = async () => {
    if (!sdk?.upgradeCommand) return
    try {
      await navigator.clipboard.writeText(sdk.upgradeCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用则忽略，命令本身可见可手抄 */ }
  }

  return <>
    <div className="mb-2 rounded-md border px-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">对话引擎运行时（{rows.length}）</span>
        <span role="status" className={cn('text-[10px]', outdated.length ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--color-muted-foreground)]')}>
          {checking ? '正在检查最新版本…' : outdated.length ? `${outdated.length} 个可更新` : sdk?.latest || rows.some(row => row.version?.latest) ? '均为最新' : ''}
        </span>
        <button type="button" onClick={() => void loadSdk(true)} disabled={checking}
          className="ml-auto flex min-h-8 items-center gap-1 rounded border px-2 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50">
          <RefreshCw className={cn('size-3', checking && 'animate-spin')} />{checking ? '检查中…' : '检查更新'}
        </button>
      </div>
      {(sdkError || sdk?.error) && <p role="alert" className="mt-1 text-[var(--color-destructive)]">{sdkError ?? sdk?.error}</p>}
      {catalog?.error && <p className="mt-1 text-[var(--color-muted-foreground)]">{catalog.error}</p>}
      <ul aria-label="对话引擎运行时" className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(engine => {
          const { version, probe } = engine
          const available = engine.selectable === undefined ? '可用性待检测' : engine.selectable ? '会话可选' : '会话不可选'
          const runtime = version?.cliVersion ?? probe?.runtimeVersion
          const detail = version?.error || (probe?.status !== 'ready' ? probe?.detail : undefined)
          const summary = versionSummary(engine)
          return <li key={engine.id} className={cn('min-w-0 rounded-md border px-2 py-1.5', summary.tone === 'update' && 'border-amber-400/70')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium">{engine.name}</span>
              <span className="text-[var(--color-muted-foreground)]">{available}</span>
            </div>
            <div className={cn('mt-1 break-words', summary.tone === 'update' ? 'font-medium text-amber-700 dark:text-amber-300'
              : summary.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--color-muted-foreground)]')}>
              {summary.text}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 break-all text-[var(--color-muted-foreground)]">
              <span>{version?.packageName ?? probe?.runtimeName}</span>
              {runtime && runtime !== installedVersion(engine) && <span>运行时 {runtime}</span>}
            </div>
            {detail && <div className="mt-0.5 break-words text-[var(--color-muted-foreground)]">{detail}</div>}
          </li>
        })}
      </ul>
      {outdated.length > 0 && sdk?.upgradeCommand && (
        <details className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
          <summary className="cursor-pointer">手动升级命令</summary>
          <button type="button" onClick={() => void copyUpgrade()}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md bg-[var(--color-muted)] px-2 py-1 text-left hover:bg-[var(--color-accent)]">
            <code className="min-w-0 flex-1 break-all">{sdk.upgradeCommand}</code>
            {copied ? <Check className="size-3 shrink-0 text-emerald-600" /> : <Copy className="size-3 shrink-0 opacity-60" />}
          </button>
        </details>
      )}
    </div>
    <SdkUpgradeActions options={rows} recommended={outdated.length ? outdated.map(engine => engine.id) : undefined}
      confirmUpgrade={confirmUpgrade} onUpdated={() => void loadSdk(true)} />
  </>
}

/** 独立的对话引擎更新入口：打开即检查，默认勾选有更新的引擎，执行前说明影响。 */
export function EngineUpdatePanel({ catalog, onClose }: { catalog?: EngineCatalogView; onClose: () => void }) {
  const confirm = useConfirm()
  const confirmUpgrade = (engines: string[]) => confirm({
    title: `更新 ${engines.length} 个对话引擎`,
    description: '将安装所选引擎的最新 SDK，统一校验通过后重连一次运行时。正在执行的会话轮次会被打断，建议在会话和后台任务结束后进行。校验失败会保留原版本。',
    confirmText: '开始更新',
  })
  return (
    <div className="border-b bg-[var(--color-muted)]/30 px-3 py-3">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">对话引擎更新</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">检查 Claude Code、Codex 等引擎的版本；新模型通常需要更新引擎后才会出现。</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" aria-label="关闭对话引擎更新" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <EngineRuntimeSection catalog={catalog} autoCheck confirmUpgrade={confirmUpgrade} />
    </div>
  )
}

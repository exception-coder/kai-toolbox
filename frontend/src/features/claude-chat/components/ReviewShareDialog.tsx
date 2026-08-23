import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createReviewShare, type ReviewShareMode } from '../api'
import { buildReviewContextSnapshot, extractCoreIndex, initialReviewSpecification, type ReviewContextBaseline } from '../lib/reviewShareContext'
import { useReviewShareBaseline } from '../hooks/useReviewShareBaseline'
import { ReviewContextOverview } from './ReviewContextOverview'
import type { ChatItem, Engine, ProjectModule } from '../types'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'

interface Props {
  open: boolean
  sessionId: string
  cwd: string
  sessionTitle?: string | null
  systemName: string
  moduleName: string
  engine: Engine
  sdkSessionId?: string | null
  codexHome?: string | null
  officialProvider?: boolean
  items: ChatItem[]
  linkedPrd?: PrdSessionView | null
  onClose: () => void
}

export function ReviewShareDialog({ open, sessionId, sessionTitle, systemName: defaultSystemName,
  moduleName: defaultModuleName, cwd, engine, sdkSessionId, codexHome, officialProvider = true,
  items, linkedPrd, onClose }: Props) {
  const [mode, setMode] = useState<ReviewShareMode>('SAFE_SNAPSHOT')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [systemName, setSystemName] = useState(defaultSystemName)
  const [moduleName, setModuleName] = useState(defaultModuleName)
  const [selectedModuleKey, setSelectedModuleKey] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [initialSpecification, setInitialSpecification] = useState(() =>
    initialReviewSpecification(items, sessionTitle || '请补充当前需求目标、范围和验收口径'))
  const baselineState = useReviewShareBaseline(cwd, linkedPrd)
  const selectedModule = baselineState.modules.find(module => moduleIdentity(module) === selectedModuleKey)
    ?? baselineState.matchedModule
  const coreIndex = useMemo(() => extractCoreIndex(baselineState.coreSpecification), [baselineState.coreSpecification])

  useEffect(() => {
    if (baselineState.project?.project) setSystemName(baselineState.project.project)
    if (baselineState.matchedModule) {
      setSelectedModuleKey(moduleIdentity(baselineState.matchedModule))
      setModuleName(baselineState.matchedModule.name)
    }
    if (baselineState.initialSpecification) setInitialSpecification(baselineState.initialSpecification)
  }, [baselineState.project, baselineState.matchedModule, baselineState.initialSpecification])

  useEffect(() => { setConfirmed(false) }, [systemName, moduleName, selectedModuleKey, initialSpecification, coreIndex])

  const contextBaseline = useMemo<ReviewContextBaseline>(() => {
    const warnings = [...baselineState.warnings]
    if (!selectedModule) warnings.push('尚未选择可靠的项目模块。')
    const status = !systemName.trim() || !moduleName.trim() || !initialSpecification.trim()
      ? 'BLOCKED'
      : warnings.length === 0 ? 'READY' : 'DEGRADED'
    return {
      systemName,
      projectName: baselineState.project?.project || systemName,
      moduleName,
      moduleKey: selectedModule?.key || selectedModule?.relPath || moduleName,
      moduleSource: selectedModule ? (baselineState.project?.fromKnowledge ? 'KNOWLEDGE' : 'AUTO') : 'MANUAL',
      moduleSummary: selectedModule?.summary,
      modulePaths: selectedModule && baselineState.project
        ? relativeModulePaths(baselineState.project.projectPath, selectedModule) : [],
      prdTitle: linkedPrd?.title,
      prdUpdatedAt: linkedPrd?.updatedAt,
      initialSpecification,
      initialSpecificationSource: baselineState.initialSpecification && linkedPrd
        ? `关联规格 · ${linkedPrd.title}` : '开发会话最近业务消息 · 开发者确认',
      coreIndex,
      coreSpecificationSource: coreIndex && linkedPrd ? `关联规格 · ${linkedPrd.title} · 核心规格` : undefined,
      status,
      warnings,
    }
  }, [baselineState, selectedModule, systemName, moduleName, initialSpecification, coreIndex, linkedPrd])
  const snapshot = useMemo(() => buildReviewContextSnapshot({ baseline: contextBaseline, items }), [contextBaseline, items])
  const fullForkAvailable = engine === 'codex' && officialProvider && Boolean(sdkSessionId)
  const baselineReady = contextBaseline.status !== 'BLOCKED' && confirmed && !baselineState.loading
  if (!open) return null

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const anchorItem = [...items].reverse().find(item => item.kind === 'assistant' && Boolean(item.forkAnchor))
      const lastTurnId = anchorItem?.kind === 'assistant' ? anchorItem.forkAnchor : undefined
      const result = await createReviewShare(sessionId, {
        mode,
        title: `${systemName.trim()} · ${moduleName.trim()} · 计划评审`,
        contextSnapshot: snapshot,
        expiresInDays: days,
        lastTurnId,
        codexHome: codexHome?.trim() || undefined,
      })
      const url = new URL(result.sharePath, window.location.origin)
      if (result.lanIpv4) url.hostname = result.lanIpv4
      setShareUrl(url.toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true); window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-[var(--color-card)] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">分享开发计划评审</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">先确认项目模块、初始化规格与核心索引。创建后，这一版本会作为业务评审和审计回复的固定依据。</p>
          </div>
          <button type="button" aria-label="关闭分享评审" onClick={onClose} className="rounded p-1 hover:bg-[var(--color-muted)]"><X className="size-4" /></button>
        </div>

        <section className="mt-5 border-y py-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium">评审对象与业务基线</h3>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">这些内容会随链接固化，AI 将据此核对后续业务意见；创建前可直接修正。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">
              系统
              <input value={systemName} onChange={event => setSystemName(event.target.value)} maxLength={80} placeholder="例如：ERP"
                className="h-9 rounded-md border bg-[var(--color-background)] px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              模块
              {baselineState.modules.length > 0 ? (
                <select value={selectedModuleKey} onChange={event => {
                  const next = baselineState.modules.find(module => moduleIdentity(module) === event.target.value)
                  setSelectedModuleKey(event.target.value)
                  if (next) setModuleName(next.name)
                }} className="h-9 rounded-md border bg-[var(--color-background)] px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
                  <option value="">请选择项目模块</option>
                  {baselineState.modules.map(module => <option key={moduleIdentity(module)} value={moduleIdentity(module)}>{module.name}</option>)}
                </select>
              ) : (
                <input value={moduleName} onChange={event => setModuleName(event.target.value)} maxLength={120} placeholder="例如：计划评审"
                  className="h-9 rounded-md border bg-[var(--color-background)] px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
              )}
            </label>
          </div>
          <label className="mt-3 grid gap-1.5 text-xs font-medium">
            当前需求初始规格
            <textarea value={initialSpecification} onChange={event => setInitialSpecification(event.target.value)} maxLength={6000} rows={5}
              placeholder="说明当前需求目标、适用范围、关键规则、例外和验收口径"
              className="min-h-28 resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm font-normal leading-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
          </label>
        </section>

        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">将随链接固化的核心上下文</h3>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">公开评审页展示同一份结构化快照；代码边界仅开发侧可见。</p>
            </div>
            {baselineState.loading && <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="size-3.5 animate-spin" />正在加载</span>}
          </div>
          <div className="border-y border-[var(--color-border)] py-3">
            <ReviewContextOverview snapshot={snapshot} />
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-[var(--color-foreground)]">
            <input type="checkbox" checked={confirmed} disabled={baselineState.loading || contextBaseline.status === 'BLOCKED'}
              onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            <span>我已确认项目模块、初始化规格与核心索引正确，并同意将当前版本固化到评审链接。</span>
          </label>
          {contextBaseline.status === 'BLOCKED' && <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-destructive)]"><AlertTriangle className="size-3.5" />请先补齐系统、模块和当前需求初始规格。</p>}
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ModeCard active={mode === 'SAFE_SNAPSHOT'} title="安全快照" badge="推荐"
            text="提取最近的需求与方案上下文，新建独立评审线程；不携带开发工具和完整历史。"
            onClick={() => setMode('SAFE_SNAPSHOT')} />
          <ModeCard active={mode === 'FULL_FORK'} disabled={!fullForkAvailable} title="完整上下文"
            badge="Codex App Server" text={fullForkAvailable ? '原生 fork 当前 Codex Thread，再切换到隔离评审目录与只读策略。' : '仅已有原生 Thread 的官方 Codex 会话可用。'}
            onClick={() => fullForkAvailable && setMode('FULL_FORK')} />
        </div>

        <div className="mt-4 flex items-center justify-between border-y bg-[var(--color-muted)]/25 px-1 py-2.5">
          <span className="text-sm">链接有效期</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm">
            <option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4 shrink-0" />服务端固定 review-only：禁止切换权限、访问项目工作区、调用 MCP、执行命令或写入文件。
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">评审固定使用 Codex 官方默认模型与标准速度；Auth：{codexHome?.trim().split(/[\\/]/).filter(Boolean).pop() || '默认 Auth'}。</p>
        {error && <p className="mt-3 text-sm text-[var(--color-destructive)]">{error}</p>}
        {shareUrl && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border p-2">
            <input readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" />
            <Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? '已复制' : '复制链接'}</Button>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          {!shareUrl && <Button onClick={() => void create()} disabled={busy || !baselineReady || (mode === 'FULL_FORK' && !fullForkAvailable)}>{busy && <Loader2 className="size-4 animate-spin" />}创建评审链接</Button>}
        </div>
      </div>
    </div>
  )
}

function ModeCard({ active, disabled, title, badge, text, onClick }: { active: boolean; disabled?: boolean; title: string; badge: string; text: string; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg border p-3 text-left transition ${active ? 'border-[var(--color-primary)] bg-[var(--color-muted)]/40 ring-1 ring-[var(--color-primary)]/20' : 'hover:bg-[var(--color-muted)]'} disabled:cursor-not-allowed disabled:opacity-45`}>
    <span className="flex items-center justify-between gap-2"><strong className="text-sm">{title}</strong><span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px]">{badge}</span></span>
    <span className="mt-2 block text-xs leading-5 text-[var(--color-muted-foreground)]">{text}</span>
  </button>
}

function moduleIdentity(module: ProjectModule): string {
  return module.key || module.relPath || module.absPath
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function relativePath(root: string, value: string): string {
  const normalizedRoot = normalizePath(root)
  const normalizedValue = normalizePath(value)
  if (normalizedValue.toLowerCase() === normalizedRoot.toLowerCase()) return '.'
  return normalizedValue.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalizedValue.slice(normalizedRoot.length + 1) : ''
}

function relativeModulePaths(root: string, module: ProjectModule): string[] {
  const paths = [module.relPath, module.codePath, module.webPath, ...(module.webPaths ?? [])]
    .filter((path): path is string => Boolean(path))
    .map(path => relativePath(root, path) || (/^[a-zA-Z]:\//.test(normalizePath(path)) ? '' : normalizePath(path)))
    .filter(path => path !== '.')
    .filter(Boolean)
  return [...new Set(paths)]
}

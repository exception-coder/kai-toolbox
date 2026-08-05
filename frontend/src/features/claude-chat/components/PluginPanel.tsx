import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Download, X, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authEventSource } from '@/lib/api'
import { getSidecarVersion, getTeamDependencyEnvironment, listSuites, listTeamRepositories, pluginInstallStreamPath, pluginUpdateStreamPath } from '../api'
import type { SidecarVersion, SuiteStatus, TeamDependencyEnvironment, TeamRepositoryStatus } from '../types'

const GIT_SOURCE_KEY = 'kai-toolbox:team-dependencies:git-source'

function initialGitSource(): 'gitee' | 'github' {
  const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(GIT_SOURCE_KEY)
  return saved === 'github' ? 'github' : 'gitee'
}

function formatSyncTime(value: number | null) {
  return value == null ? '从未记录' : new Date(value).toLocaleString()
}

/**
 * 团队套件面板：展示当前会话所用的 3 插件 + 2 MCP 版本/状态，并一键更新插件（SSE 实时回显）。
 * 三个团队插件同时支持 Claude Code 与 Codex；更新走固定后端命令、非 AI 流。
 */
export function PluginPanel({ sessionId, onClose }: { sessionId?: string; onClose: () => void }) {
  const [suites, setSuites] = useState<SuiteStatus[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [sdk, setSdk] = useState<SidecarVersion | null>(null)
  const [sdkChecking, setSdkChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gitSource, setGitSource] = useState<'gitee' | 'github'>(initialGitSource)
  const [environment, setEnvironment] = useState<TeamDependencyEnvironment | null>(null)
  const [environmentLoading, setEnvironmentLoading] = useState(false)
  const [repositories, setRepositories] = useState<TeamRepositoryStatus[] | null>(null)
  const [repositoriesChecking, setRepositoriesChecking] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [suiteResult, repositoryResult] = await Promise.all([listSuites(sessionId), listTeamRepositories(gitSource)])
      setSuites(suiteResult); setRepositories(repositoryResult)
    } catch { /* 静默 */ } finally { setLoading(false) }
  }

  const checkRepositories = async () => {
    setRepositoriesChecking(true)
    try { setRepositories(await listTeamRepositories(gitSource, true)) } catch { /* 静默 */ } finally { setRepositoriesChecking(false) }
  }

  const checkEnvironment = async () => {
    setEnvironmentLoading(true)
    try { setEnvironment(await getTeamDependencyEnvironment(sessionId)) } catch { /* 静默 */ } finally { setEnvironmentLoading(false) }
  }

  /** check=true 才联网查 npm 最新版；进面板时只读本地版本，不联网。 */
  const loadSdk = async (check = false) => {
    if (check) setSdkChecking(true)
    try { setSdk(await getSidecarVersion(check)) } catch { /* 静默 */ } finally { setSdkChecking(false) }
  }

  const copyUpgrade = async () => {
    if (!sdk?.upgradeCommand) return
    try {
      await navigator.clipboard.writeText(sdk.upgradeCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用则忽略，命令本身可见可手抄 */ }
  }

  /** 对 MCP 知识库 git fetch 后再读，使「落后远端」准确（较慢）。 */
  const checkRemote = async () => {
    if (checking) return
    setChecking(true)
    try { setSuites(await listSuites(sessionId, true)) } catch { /* 静默 */ } finally { setChecking(false) }
  }

  useEffect(() => {
    void refresh()
    void loadSdk()
    void checkEnvironment()
    return () => esRef.current?.close()
  }, [sessionId])

  useEffect(() => {
    window.localStorage.setItem(GIT_SOURCE_KEY, gitSource)
    void listTeamRepositories(gitSource).then(setRepositories).catch(() => undefined)
  }, [gitSource])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  const startTask = (path: string) => {
    if (updating) return
    setLines([]); setUpdating(true)
    const es = authEventSource(path)
    esRef.current = es
    es.onmessage = ev => {
      let m: { type: string; engine?: string; step?: string; text?: string; exitCode?: number; message?: string }
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.type === 'line') {
        setLines(prev => [...prev, `${m.engine ? `[${m.engine}] ` : ''}${m.text ?? ''}`])
      } else if (m.type === 'step') {
        setLines(prev => [...prev, `[${m.engine}] ${m.step} → exit ${m.exitCode}`])
      } else if (m.type === 'done') {
        setLines(prev => [...prev, '✓ 操作完成（重启 Claude Code / Codex 会话加载新版本）'])
        es.close(); setUpdating(false); void refresh()
      } else if (m.type === 'error') {
        setLines(prev => [...prev, `✖ ${m.message ?? '更新出错'}`])
        es.close(); setUpdating(false)
      }
    }
    es.onerror = () => {
      // 连接结束/出错:若仍在更新态则收尾(后端 complete 也会触发 onerror)
      es.close()
      setUpdating(prev => { if (prev) { setLines(l => [...l, '— 连接结束 —']); void refresh() } return false })
    }
  }

  const startUpdate = () => startTask(pluginUpdateStreamPath(sessionId))
  const startInstall = () => startTask(pluginInstallStreamPath(sessionId, gitSource))

  return (
    <div className="border-b px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">团队依赖 · 拉取与安装</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => void refresh()} disabled={loading} aria-label="刷新">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={onClose} aria-label="关闭">
          <X className="size-4" />
        </Button>
      </div>

      <div className="mb-2 rounded-md border p-2 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-medium">安装环境</span>
          {environment && (
            <span className={environment.ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
              {environment.ready ? '已就绪' : '有缺失项'}
            </span>
          )}
          <button type="button" onClick={() => void checkEnvironment()} disabled={environmentLoading}
            className="ml-auto rounded border px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent)] disabled:opacity-50">
            {environmentLoading ? '检查中…' : '重新检查'}
          </button>
        </div>
        {environment == null ? (
          <p className="text-[var(--color-muted-foreground)]">正在检查 Git、Node.js、Claude Code、Codex…</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            {environment.tools.map(tool => (
              <li key={tool.id}>
                <a href={tool.officialUrl} target="_blank" rel="noreferrer"
                  title={tool.installed ? `${tool.name} ${tool.version ?? ''}` : `${tool.name} 未安装；${tool.installCommand}`}
                  className={`block min-w-0 rounded-md border px-2 py-1.5 transition-colors hover:bg-[var(--color-accent)] ${tool.installed
                    ? 'border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                    : 'border-red-300/70 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`size-2 shrink-0 rounded-full ${tool.installed ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="min-w-0 truncate font-medium">{tool.name}</span>
                  </div>
                  <div className={`mt-0.5 truncate text-[10px] ${tool.installed
                    ? 'text-[var(--color-muted-foreground)]'
                    : 'text-red-600 dark:text-red-400'}`}>
                    {tool.installed ? tool.version ?? '已安装' : '未安装'}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        {environment?.os === 'other' && (
          <p className="mt-1 text-[10px] text-amber-600">当前仅提供 Windows 与 macOS 安装指引。</p>
        )}
      </div>

      <div className="mb-2 rounded-md border p-2 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-medium">Git 拉取源</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已记住选择</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {(['gitee', 'github'] as const).map(source => (
            <button key={source} type="button" disabled={updating} onClick={() => setGitSource(source)}
              className={`rounded-md border px-2 py-1.5 ${gitSource === source
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'hover:bg-[var(--color-accent)]'}`}>
              {source === 'gitee' ? 'Gitee（默认）' : 'GitHub'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
          切换源后，若本地 origin 不一致，会移除 ~/.kai-toolbox/team-tools 下对应仓库并从新源重新拉取。
        </p>
      </div>

      <div className="mb-2 rounded-md border p-2 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-medium">依赖仓库（5）</span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">目标源：{gitSource === 'gitee' ? 'Gitee' : 'GitHub'}</span>
          <button type="button" onClick={() => void checkRepositories()} disabled={repositoriesChecking}
            className="ml-auto rounded border px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent)] disabled:opacity-50">
            {repositoriesChecking ? 'fetch 中…' : '检查远端'}
          </button>
        </div>
        {repositories == null ? (
          <p className="text-[var(--color-muted-foreground)]">正在读取仓库状态…</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {repositories.map(repo => {
              const latest = repo.cloned && repo.sourceMatches && repo.remoteChecked && repo.behind === 0
              return (
                <li key={repo.name} className="min-w-0 rounded-md border bg-[var(--color-muted)]/30 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`size-2 shrink-0 rounded-full ${latest ? 'bg-emerald-500' : repo.cloned ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <span className="min-w-0 flex-1 truncate font-medium" title={repo.name}>{repo.name}</span>
                    {!repo.cloned ? (
                      <span className="text-[var(--color-destructive)]">未拉取</span>
                    ) : !repo.sourceMatches ? (
                      <span className="text-amber-600 dark:text-amber-400">当前 {repo.source} · 待切源</span>
                    ) : latest ? (
                      <span className="text-emerald-600 dark:text-emerald-400">已是最新</span>
                    ) : repo.remoteChecked && repo.behind != null && repo.behind > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">落后 {repo.behind} 个提交</span>
                    ) : repo.lastSyncedAt != null ? (
                      <span className="text-[var(--color-muted-foreground)]">待检查远端</span>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">远端状态未知</span>
                    )}
                  </div>
                  {repo.cloned && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-[var(--color-muted-foreground)]">
                      <span>{repo.source?.toUpperCase()} · {repo.commit ?? '无提交'}{repo.commitDate ? ` · ${repo.commitDate}` : ''}</span>
                      <span>上次同步：{formatSyncTime(repo.lastSyncedAt)}</span>
                      {repo.ahead != null && repo.ahead > 0 && <span>本地领先 {repo.ahead}</span>}
                      {repo.dirty && <span className="text-amber-600 dark:text-amber-400">有未提交修改</span>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">
          “检查远端”会执行 git fetch；“已是最新”表示当前 HEAD 相对所选源上游落后数为 0。
        </p>
      </div>

      <div className="mb-2 rounded-md border px-2 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium">对话引擎 SDK（sidecar）</span>
          {sdk?.outdated && (
            <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900 dark:text-amber-200">
              可升级
            </span>
          )}
          <button type="button" onClick={() => void loadSdk(true)} disabled={sdkChecking}
            className="ml-auto rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50">
            {sdkChecking ? '查询中…' : '检查更新'}
          </button>
        </div>
        {sdk == null ? (
          <div className="mt-1 text-[var(--color-muted-foreground)]">加载中…</div>
        ) : sdk.error ? (
          <div className="mt-1 text-[var(--color-destructive)]">{sdk.error}</div>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--color-muted-foreground)]">
              <span>已装 <span className="text-[var(--color-foreground)]">{sdk.installed ?? '未知'}</span></span>
              {sdk.cliVersion && <span>claude <span className="text-[var(--color-foreground)]">{sdk.cliVersion}</span></span>}
              {sdk.latest && <span>最新 <span className="text-[var(--color-foreground)]">{sdk.latest}</span></span>}
              {sdk.latest && !sdk.outdated && <span className="text-emerald-600 dark:text-emerald-400">已最新</span>}
            </div>
            {sdk.outdated && sdk.upgradeCommand && (
              <>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
                  可选模型清单由捆绑的 claude 二进制决定，SDK 落后只会表现为「新模型选不到」，不会报错。升级后需重启 sidecar。
                </p>
                <button type="button" onClick={() => void copyUpgrade()}
                  className="mt-1 flex w-full items-center gap-1.5 rounded-md bg-[var(--color-muted)] px-2 py-1 text-left text-[10px] hover:bg-[var(--color-accent)]">
                  <code className="min-w-0 flex-1 break-all">{sdk.upgradeCommand}</code>
                  {copied ? <Check className="size-3 shrink-0 text-emerald-600" /> : <Copy className="size-3 shrink-0 opacity-60" />}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="mb-1.5 text-xs font-medium">插件与 MCP（5）</div>
      {suites == null ? (
        <div className="text-xs text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {suites.map(p => {
            const claudeOld = p.kind === 'plugin' && p.claudeInstalled && p.available && p.claudeInstalled !== p.available
            const codexOld = p.kind === 'plugin' && p.codexInstalled && p.available && p.codexInstalled !== p.available
            return (
              <li key={`${p.kind}:${p.name}`} className="flex min-w-0 flex-col gap-1 rounded-md border px-2 py-1.5 text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                <span className={`size-2 shrink-0 rounded-full ${p.kind === 'plugin'
                  ? p.claudeInstalled && p.codexInstalled ? 'bg-emerald-500' : 'bg-red-500'
                  : p.present ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className={`shrink-0 rounded px-1 text-[10px] ${p.kind === 'mcp'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
                  {p.kind === 'mcp' ? 'MCP' : '插件'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium" title={p.name}>{p.name}</span>
                </div>
                {p.kind === 'plugin' ? (
                  <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                    <span>
                      Claude <span className={p.claudeInstalled ? 'text-[var(--color-foreground)]' : 'text-[var(--color-destructive)]'}>{p.claudeInstalled ?? '未装'}</span>
                      {claudeOld && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900 dark:text-amber-200">可更新</span>}
                    </span>
                    <span>
                      Codex <span className={p.codexInstalled ? 'text-[var(--color-foreground)]' : 'text-[var(--color-destructive)]'}>{p.codexInstalled ?? '未装'}</span>
                      {codexOld && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900 dark:text-amber-200">可更新</span>}
                    </span>
                    {p.available && <span className="text-[10px] opacity-70">最新 {p.available}</span>}
                  </span>
                ) : !p.present ? (
                  <span className="shrink-0 text-[var(--color-muted-foreground)]">未配置</span>
                ) : (
                  <span className="min-w-0 truncate text-[10px] text-[var(--color-muted-foreground)]">
                    {p.repoDate
                      ? <>知识库 <span className="text-[var(--color-foreground)]">{p.repoDate}</span>{p.repoCommit && <> · {p.repoCommit}</>}</>
                      : '已配置'}
                    {p.behind == null ? null
                      : p.behind === 0
                        ? <span className="ml-1 text-emerald-600 dark:text-emerald-400">已最新</span>
                        : <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900 dark:text-amber-200">落后 {p.behind}</span>}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={checkRemote} disabled={checking}
        className="mt-2 w-full rounded-md border py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50">
        {checking ? '检查中…（git fetch 知识库）' : '检查 MCP 知识库是否最新（对比远端）'}
      </button>

      <Button size="sm" className="mt-3 w-full" onClick={startInstall} disabled={updating || environment?.ready === false}>
        <Download className="size-4" /> {updating ? '执行中…' : environment?.ready === false ? '请先安装缺失环境' : '拉取依赖并安装（Claude Code + Codex）'}
      </Button>
      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={startUpdate} disabled={updating}>
        <Download className="size-4" /> {updating ? '更新中…' : '一键更新团队插件（Claude + Codex）'}
      </Button>
      <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
        双端更新 3 个插件（Codex 首次会自动添加 git 市场）；MCP 由每日同步脚本 git pull 维护，不在此处更新。
      </p>

      {lines.length > 0 && (
        <pre ref={logRef} className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--color-muted)] p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

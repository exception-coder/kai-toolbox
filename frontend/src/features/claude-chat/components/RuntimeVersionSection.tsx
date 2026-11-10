import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getRuntimeVersion, type RuntimeVersion } from '../api'

/** 页面构建提交；测试等未注入常量的环境显示 dev。 */
const FRONTEND_COMMIT = typeof __FORGE_BUILD_COMMIT__ === 'string' ? __FORGE_BUILD_COMMIT__ : 'dev'

const short = (commit?: string | null) => commit ? commit.slice(0, 9) : '—'

/** 运行版本：核对后端启动版本、当前源码与本页构建，提示待加载的提交；只读，不触发重启。 */
export function RuntimeVersionSection() {
  // 与所在面板一致，打开时读取一次、手动刷新；不常驻轮询。
  const [data, setData] = useState<RuntimeVersion | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async (refresh: boolean) => {
    setLoading(true)
    try { setData(await getRuntimeVersion(refresh)); setFailed(false) } catch { setFailed(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(false) }, [load])
  const pending = data?.pendingCommits ?? null
  const frontendBehind = !!data?.sourceHead && FRONTEND_COMMIT !== 'dev' && !data.sourceHead.startsWith(FRONTEND_COMMIT)
  return <div className="mb-2 rounded-md border px-2 py-1.5 text-xs">
    <div className="flex items-center gap-2">
      <span className="font-medium">运行版本</span>
      {pending !== null && pending > 0 && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900 dark:text-amber-200">{pending} 个提交待加载</span>}
      {pending === 0 && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">后端已是最新源码</span>}
      <button type="button" aria-label="刷新运行版本" title="刷新运行版本" disabled={loading}
        onClick={() => void load(true)} className="ml-auto rounded p-0.5 hover:bg-[var(--color-muted)] disabled:opacity-50">
        <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
    {failed && <p role="alert" className="mt-1 text-[10px]">运行版本读取失败，可刷新重试。</p>}
    {data && <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-muted-foreground)]">
      <dt>后端启动于</dt><dd className="font-mono">{short(data.startedCommit)} · {new Date(data.startedAt).toLocaleString()}</dd>
      <dt>当前源码</dt><dd className="font-mono">{short(data.sourceHead)}</dd>
      <dt>本页构建</dt><dd className="font-mono">{FRONTEND_COMMIT}{frontendBehind ? '（与当前源码不同）' : ''}</dd>
    </dl>}
    {data?.error && <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{data.error}</p>}
    {!!data?.pendingSubjects.length && <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--color-muted-foreground)]">
      {data.pendingSubjects.map(subject => <li key={subject} className="truncate" title={subject}>{subject}</li>)}
    </ul>}
    <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">待加载的提交需经授权重启后生效；版本一致不代表功能已验收。</p>
  </div>
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import {
  getAssistantIntegrationStatus,
  listAssistantProjectBindings,
  type AssistantIntegrationStatus,
  type AssistantProjectBinding,
} from '../api'

const FORGE_PROJECT_KEY = 'kai-toolbox'

const externalHostExample = `toolbox:
  auth:
    external-login:
      enabled: true
      allowed-origins:
        - "https://your-system.example.com"
  claude-chat:
    ws:
      consult-allowed-origin-patterns:
        - "https://your-system.example.com"`

const loaderExample = `<script src="https://kai-tool.exception-coder.com/assistant-sdk/loader.js"></script>
<script type="module">
  const { sdk } = await KaiAssistantLoader.load({
    channel: 'stable',
    // 可选：不填则使用 Loader 所在域；内网可填 http://10.10.8.20:8080
    requestBaseUrl: 'https://kai-tool.exception-coder.com'
  })
  sdk.initialize({
    appId: 'YOUR_SYSTEM',
    projectKey: 'your-project-key',
    externalLogin: {},
    page: { url: location.pathname + location.search, title: document.title }
  })
</script>`

export function AssistantIntegrationPage() {
  const [bindings, setBindings] = useState<AssistantProjectBinding[]>([])
  const [status, setStatus] = useState<AssistantIntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const forgeBinding = useMemo(() => bindings.find((item) => (
    item.projectKey.toLowerCase() === FORGE_PROJECT_KEY
  )), [bindings])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextBindings, nextStatus] = await Promise.all([
        listAssistantProjectBindings(),
        getAssistantIntegrationStatus(),
      ])
      setBindings(nextBindings)
      setStatus(nextStatus)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取项目绑定')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  const bindingReady = Boolean(forgeBinding?.sourceAvailable)

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-10 lg:px-10 lg:py-14">
      <header className="max-w-3xl border-b border-[var(--color-border)] pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">ASSISTANT INTEGRATION</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--color-foreground)]">嵌入式业务助手</h1>
        <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
          彩虹胶囊由 Forge 统一发布。宿主系统只提供身份、页面上下文和稳定项目键；会话恢复、消息归档、附件与诊断仍由统一运行时处理。
        </p>
      </header>

      <section className="grid gap-8 border-b border-[var(--color-border)] py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="01" title="当前状态" />
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                {bindingReady ? <Check className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-amber-600" />}
                {loading ? '正在读取 Forge 项目绑定' : bindingReady ? 'Forge 源码绑定可用' : 'Forge 源码绑定需要处理'}
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                运行时使用 <Code>appId=KAI_TOOLBOX</Code> 标识宿主，用 <Code>projectKey=kai-toolbox</Code> 定位受控源码。两者用途不同，不能互相替代。
              </p>
            </div>
            <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]">
              <RefreshCw className="size-3.5" />刷新检查
            </button>
          </div>
          {error && <p className="mt-4 border-l-2 border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger-soft-foreground)]">{error}</p>}
          {!loading && !error && (
            <dl className="mt-6 grid gap-px bg-[var(--color-border)] sm:grid-cols-3">
              <Fact label="项目键" value={forgeBinding?.projectKey ?? FORGE_PROJECT_KEY} />
              <Fact label="绑定来源" value={forgeBinding?.source ?? '未绑定'} />
              <Fact label="源码状态" value={forgeBinding?.sourceAvailable ? '目录可访问' : '尚不可用'} />
            </dl>
          )}
          {!bindingReady && !loading && (
            <Link to="/tools/system-route-inspector" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline">
              前往系统路由检测完成绑定 <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-8 border-b border-[var(--color-border)] py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="02" title="配置边界" />
        <div className="grid gap-6 md:grid-cols-2">
          <Explanation title="项目绑定" state="所有宿主都需要">
            <Code>projectKey</Code> 把页面咨询路由到对应受控源码与业务知识。报“项目未绑定”时，应修复该绑定，不是放宽域名白名单。
          </Explanation>
          <Explanation title="可信来源" state="仅跨域接入需要">
            第三方宿主从另一 Origin 登录或建立 WebSocket 时，需要同时配置 HTTP 外部登录白名单和 WS Origin 白名单。同源 Forge 页面无需重复授信。
          </Explanation>
        </div>
        <p className="mt-5 text-xs leading-5 text-[var(--color-muted-foreground)]">
          白名单应填写完整 Origin（协议 + 主机 + 可选端口），例如 <Code>https://erp.example.com</Code>；不要填写页面路径，也不要在生产环境使用 <Code>*</Code>。
        </p>
      </section>

      <section className="grid gap-8 border-b border-[var(--color-border)] py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="03" title="当前生效配置" />
        <div className="space-y-7">
          <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-2">
            <Fact label="外部登录" value={status?.externalLoginEnabled ? '已开启' : '未开启'} />
            <Fact label="外部登录配置" value={status?.externalLoginConfigured ? '开关与 Origin 已就绪' : '尚未完整配置'} />
            <Fact label="WebSocket Origin" value={status?.websocketOriginsRestricted ? '已限制明确来源' : '仍允许通配符或未配置'} />
            <Fact label="当前页面 Origin" value={window.location.origin} />
          </div>
          <ConfigurationList title="外部登录允许的 Origin" values={status?.externalLoginAllowedOrigins ?? []} empty="未配置；第三方宿主不能使用 Forge 账号跨域登录" />
          <ConfigurationList title="咨询 WebSocket 允许的 Origin Pattern" values={status?.consultAllowedOriginPatterns ?? []} empty="未配置" />
          <ConfigurationList title="运行时服务路径" values={status ? [status.loaderPath, status.externalLoginPath, status.consultWebSocketPath, status.projectBindingsPath] : []} empty="正在读取" />
        </div>
      </section>

      <section className="grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="04" title="已登记项目" />
        <div className="overflow-hidden border border-[var(--color-border)]">
          {bindings.length === 0 && !loading ? (
            <p className="px-4 py-5 text-sm text-[var(--color-muted-foreground)]">当前没有项目绑定。</p>
          ) : bindings.map((binding) => (
            <div key={binding.projectKey} className="grid gap-2 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0 md:grid-cols-[180px_1fr_120px] md:items-center">
              <div><p className="text-sm font-semibold">{binding.displayName}</p><p className="mt-1 font-mono text-[11px] text-[var(--color-muted-foreground)]">{binding.projectKey}</p></div>
              <p className="break-all font-mono text-xs text-[var(--color-muted-foreground)]">{binding.projectPath || '未绑定本机源码目录'}</p>
              <p className={binding.sourceAvailable ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>{binding.sourceAvailable ? `可用 · ${binding.source}` : `不可用 · ${binding.source}`}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-[var(--color-border)] py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="05" title="待配置模板" />
        <CodeBlock value={externalHostExample} copied={copied === 'origin'} onCopy={() => void copy('origin', externalHostExample)} />
      </section>

      <section className="grid gap-8 border-t border-[var(--color-border)] py-8 lg:grid-cols-[220px_1fr]">
        <SectionTitle index="06" title="宿主接入" />
        <div>
          <CodeBlock value={loaderExample} copied={copied === 'loader'} onCopy={() => void copy('loader', loaderExample)} />
          <p className="mt-4 text-xs leading-5 text-[var(--color-muted-foreground)]">
            <Code>requestBaseUrl</Code> 不填时默认使用 Loader 所在域；内网可填完整 IP Origin。HTTPS 宿主不能指向 HTTP 内网地址，否则会被浏览器 Mixed Content 策略拦截。现有 <Code>wsUrl</Code> 仍可显式覆盖。
          </p>
        </div>
      </section>
    </main>
  )
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return <div><span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">{index}</span><h2 className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{title}</h2></div>
}

function Explanation({ title, state, children }: { title: string; state: string; children: React.ReactNode }) {
  return <div className="border-l border-[var(--color-border)] pl-4"><div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold">{title}</h3><span className="text-[11px] text-[var(--color-muted-foreground)]">{state}</span></div><p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{children}</p></div>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--color-background)] px-4 py-3"><dt className="text-[11px] text-[var(--color-muted-foreground)]">{label}</dt><dd className="mt-1 text-sm font-medium text-[var(--color-foreground)]">{value}</dd></div>
}

function ConfigurationList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--color-foreground)]">{title}</h3>
      {values.length > 0 ? (
        <div className="mt-2 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {values.map((value) => <p key={value} className="break-all py-2.5 font-mono text-xs text-[var(--color-muted-foreground)]">{value}</p>)}
        </div>
      ) : <p className="mt-2 text-xs leading-5 text-amber-700">{empty}</p>}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[0.92em] text-[var(--color-foreground)]">{children}</code>
}

function CodeBlock({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="relative border border-[var(--color-border)] bg-[var(--color-muted)]/35">
      <button type="button" onClick={onCopy} className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 bg-[var(--color-background)] px-2.5 text-[11px] font-medium shadow-sm">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? '已复制' : '复制'}
      </button>
      <pre className="overflow-x-auto p-5 pr-24 text-xs leading-6 text-[var(--color-foreground)]"><code>{value}</code></pre>
    </div>
  )
}

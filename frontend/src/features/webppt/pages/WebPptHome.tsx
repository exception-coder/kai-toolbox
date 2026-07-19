import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { getDesignToken, getPrompt, getSamples, getVersions, sampleContentUrl } from '../api'

function ColorSwatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-10 w-10 rounded-md border"
        style={{ backgroundColor: value }}
        title={value}
      />
      <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
    </div>
  )
}

function TokenPreview({ theme }: { theme: Record<string, unknown> }) {
  const colors = (theme.colors ?? {}) as Record<string, unknown>
  const typography = (theme.typography ?? {}) as Record<string, unknown>
  const scale = (typography.scale ?? {}) as Record<string, number>
  const neutral = Array.isArray(colors.neutral) ? (colors.neutral as string[]) : []
  const chartScale = Array.isArray(colors.chart_scale) ? (colors.chart_scale as string[]) : []

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">主色 / 强调色</p>
        <div className="flex flex-wrap gap-4">
          {typeof colors.primary === 'string' && <ColorSwatch label="primary" value={colors.primary} />}
          {typeof colors.accent === 'string' && <ColorSwatch label="accent" value={colors.accent} />}
        </div>
      </div>
      {neutral.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">中性色阶</p>
          <div className="flex flex-wrap gap-4">
            {neutral.map((c, i) => (
              <ColorSwatch key={c + i} label={`neutral-${i}`} value={c} />
            ))}
          </div>
        </div>
      )}
      {chartScale.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">图表配色序列</p>
          <div className="flex flex-wrap gap-4">
            {chartScale.map((c, i) => (
              <ColorSwatch key={c + i} label={`chart-${i}`} value={c} />
            ))}
          </div>
        </div>
      )}
      {Object.keys(scale).length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">字号阶梯</p>
          <div className="flex flex-wrap items-baseline gap-4">
            {Object.entries(scale).map(([key, size]) => (
              <span key={key} style={{ fontSize: `${Math.min(Number(size), 32)}px` }}>
                {key} · {size}px
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function WebPptHome() {
  const [version, setVersion] = useState('latest')
  const [copied, setCopied] = useState(false)
  const [activeSample, setActiveSample] = useState<string | null>(null)

  const versionsQuery = useQuery({ queryKey: ['webppt', 'versions'], queryFn: getVersions })
  const tokenQuery = useQuery({
    queryKey: ['webppt', 'token', version],
    queryFn: () => getDesignToken(version),
  })
  const promptQuery = useQuery({
    queryKey: ['webppt', 'prompt', version],
    queryFn: () => getPrompt(version),
  })
  const samplesQuery = useQuery({ queryKey: ['webppt', 'samples'], queryFn: getSamples })

  const versionOptions = useMemo(() => {
    const versions = versionsQuery.data?.versions ?? []
    if (versions.length === 0) return [{ value: 'latest', label: 'latest' }]
    return versions.map((v) => ({ value: v.version, label: v.isActive ? `${v.version}（最新）` : v.version }))
  }, [versionsQuery.data])

  const currentSample = activeSample ?? samplesQuery.data?.samples[0]?.id ?? null

  async function onCopyPrompt() {
    if (!promptQuery.data) return
    try {
      await navigator.clipboard.writeText(promptQuery.data)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* 静默失败：剪贴板权限被拒绝时不打断用户 */
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">WebPPT 风格中心</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            统一、可版本追溯的 WebPPT 风格规范：Design Token、生成提示词与 reveal.js 落地样例
          </p>
        </div>
        <Segmented value={version} onChange={setVersion} options={versionOptions} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Design Token</CardTitle>
          <CardDescription>
            {tokenQuery.data ? `版本 ${tokenQuery.data.version}` : '加载中…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokenQuery.isLoading && <p className="text-sm text-[var(--color-muted-foreground)]">加载中…</p>}
          {tokenQuery.isError && <p className="text-sm text-[var(--color-destructive)]">Design Token 加载失败</p>}
          {tokenQuery.data && <TokenPreview theme={tokenQuery.data.theme} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>风格提示词</CardTitle>
            <CardDescription>生成 WebPPT 时直接粘贴给 AI 使用</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCopyPrompt} disabled={!promptQuery.data}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? '已复制' : '复制'}
          </Button>
        </CardHeader>
        <CardContent>
          {promptQuery.isLoading && <p className="text-sm text-[var(--color-muted-foreground)]">加载中…</p>}
          {promptQuery.isError && <p className="text-sm text-[var(--color-destructive)]">提示词加载失败</p>}
          {promptQuery.data && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--color-muted)] p-4 text-xs">
              {promptQuery.data}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>reveal.js 落地样例</CardTitle>
            <CardDescription>可直接在浏览器打开验证的完整 HTML 样例</CardDescription>
          </div>
          {samplesQuery.data && samplesQuery.data.samples.length > 1 && (
            <Segmented
              value={currentSample ?? ''}
              onChange={setActiveSample}
              options={samplesQuery.data.samples.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {samplesQuery.isLoading && <p className="text-sm text-[var(--color-muted-foreground)]">加载中…</p>}
          {samplesQuery.isError && <p className="text-sm text-[var(--color-destructive)]">样例加载失败</p>}
          {currentSample && (
            <iframe
              key={currentSample}
              title={`webppt-sample-${currentSample}`}
              src={sampleContentUrl(currentSample)}
              className="h-[540px] w-full rounded-md border bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import type { ProxyEntry, ProxyType } from '../lib/types'

interface Props {
  index: number
  value: ProxyEntry
  onChange: (next: ProxyEntry) => void
  onRemove: () => void
}

const TYPE_OPTIONS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
] as const

export function ProxyCard({ index, value, onChange, onRemove }: Props) {
  const update = <K extends keyof ProxyEntry>(k: K, v: ProxyEntry[K]) =>
    onChange({ ...value, [k]: v })

  const isTcpLike = value.type === 'tcp' || value.type === 'udp'
  const isHttpLike = value.type === 'http' || value.type === 'https'

  return (
    <div className="rounded-lg border bg-[var(--color-background)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">#{index + 1}</span>
          <Input
            placeholder="代理名 (必须全局唯一，例如 ssh / web-admin)"
            value={value.name}
            onChange={e => update('name', e.target.value)}
            className="w-64"
          />
          <Segmented
            value={value.type}
            onChange={t => update('type', t as ProxyType)}
            options={TYPE_OPTIONS}
          />
        </div>
        <Button size="sm" variant="outline" onClick={onRemove}>
          <Trash2 />
          删除
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <LabeledInput
          label="本地 IP (localIP)"
          hint="frpc 所在内网的目标主机，通常是 127.0.0.1，也可以填同内网另一台机器"
          value={value.localIp}
          onChange={v => update('localIp', v)}
          placeholder="127.0.0.1"
        />

        {isTcpLike && !value.rangeMode && (
          <>
            <LabeledInput
              label="本地端口 (localPort)"
              hint="frpc 要连出去的内网端口，比如 SSH = 22、MySQL = 3306"
              value={value.localPort}
              onChange={v => update('localPort', v)}
              placeholder="22"
            />
            <LabeledInput
              label="远端端口 (remotePort)"
              hint="frps 在公网监听的端口，用户从外面访问就连这个端口"
              value={value.remotePort}
              onChange={v => update('remotePort', v)}
              placeholder="6022"
            />
          </>
        )}

        {isTcpLike && value.rangeMode && (
          <>
            <LabeledInput
              label="本地端口段 (localPortsRange)"
              hint="支持区间和离散：6000-6010,7000,8080-8090"
              value={value.localPortsRange}
              onChange={v => update('localPortsRange', v)}
              placeholder="6000-6010"
            />
            <LabeledInput
              label="远端端口段 (remotePortsRange)"
              hint="数量需与本地端口段对齐，按顺序一一映射"
              value={value.remotePortsRange}
              onChange={v => update('remotePortsRange', v)}
              placeholder="6000-6010"
            />
          </>
        )}

        {isHttpLike && (
          <>
            <LabeledInput
              label="本地端口 (localPort)"
              hint="内网 Web 服务监听的端口，例如 nginx 在 80"
              value={value.localPort}
              onChange={v => update('localPort', v)}
              placeholder="80"
            />
            <LabeledInput
              label="自定义域名 (customDomains)"
              hint="DNS 必须先解析到 frps 的公网 IP；多域名用逗号分隔"
              value={value.customDomains}
              onChange={v => update('customDomains', v)}
              placeholder="blog.example.com, www.example.com"
            />
            <LabeledInput
              label="子域名 (subdomain，可选)"
              hint="要求 frps 配了 subdomainHost；最终对外访问 <subdomain>.<host>"
              value={value.subdomain}
              onChange={v => update('subdomain', v)}
              placeholder="app1"
            />
          </>
        )}
      </div>

      {isTcpLike && (
        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={value.rangeMode}
            onChange={e => update('rangeMode', e.target.checked)}
            className="size-3.5"
          />
          <span>启用端口段范围模式（一条 proxy 转发多段端口）</span>
        </label>
      )}
    </div>
  )
}

function LabeledInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium">{label}</div>
      {hint && <div className="text-[11px] text-[var(--color-muted-foreground)]">{hint}</div>}
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

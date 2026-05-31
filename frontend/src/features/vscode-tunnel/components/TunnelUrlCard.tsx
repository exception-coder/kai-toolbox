import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  url: string
  tunnelName: string | null
  startedAt: string | null
  onStop: () => void
  stopping: boolean
}

export function TunnelUrlCard({ url, tunnelName, startedAt, onStop, stopping }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板 API 在非 https / 非 localhost 下会拒绝；保留 fallback：选中文本即可
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>隧道运行中</span>
          <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
            {tunnelName && <>name: <code className="text-[var(--color-foreground)]">{tunnelName}</code></>}
            {startedAt && <> · 启动 {formatStartedAt(startedAt)}</>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-xs text-[var(--color-muted-foreground)] mb-1">访问地址</div>
            <div className="break-all rounded-md border bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
              {url}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyUrl}>
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
              {copied ? '已复制' : '复制 URL'}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                新标签打开
              </a>
            </Button>
            <Button size="sm" variant="destructive" onClick={onStop} disabled={stopping}>
              {stopping ? '停止中…' : '停止隧道'}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
            手机扫右侧二维码或打开 URL，使用<strong className="text-[var(--color-foreground)]">同一个 GitHub 账号</strong>
            登录 vscode.dev 即可远程操作本机 VS Code（含 Claude Code 等扩展）。隧道不监听本机端口，
            通过反向连接走微软网关，外网可达但仅授权账号能进。
          </p>
        </div>
        <div className="shrink-0 self-center sm:self-start">
          <div className="rounded-md border bg-white p-3">
            <QRCodeSVG value={url} size={180} level="M" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatStartedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

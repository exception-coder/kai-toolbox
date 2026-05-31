import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  deviceCode: string
  deviceLoginUrl: string | null
  tunnelName: string | null
}

const FALLBACK_LOGIN = 'https://github.com/login/device'

export function AuthPromptCard({ deviceCode, deviceLoginUrl, tunnelName }: Props) {
  const [copied, setCopied] = useState(false)
  const loginUrl = deviceLoginUrl ?? FALLBACK_LOGIN

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(deviceCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>首次使用：需在 GitHub 授权</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          检测到这是本机第一次启用 VS Code Tunnel（或上次的登录凭证已过期）。
          请用浏览器打开 GitHub 设备登录页，输入下方代码授权后，隧道会自动进入运行状态。
        </p>

        <div className="rounded-md border bg-[var(--color-muted)] p-4">
          <div className="text-xs text-[var(--color-muted-foreground)] mb-2">设备登录码</div>
          <div className="flex items-center gap-3">
            <code className="font-mono text-2xl font-semibold tracking-widest">{deviceCode}</code>
            <Button size="sm" variant="outline" onClick={copyCode}>
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={loginUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink />
              打开 GitHub 登录页
            </a>
          </Button>
        </div>

        {tunnelName && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            授权完成后，隧道名 <code className="text-[var(--color-foreground)]">{tunnelName}</code> 将自动连接到 vscode.dev。
          </p>
        )}
      </CardContent>
    </Card>
  )
}

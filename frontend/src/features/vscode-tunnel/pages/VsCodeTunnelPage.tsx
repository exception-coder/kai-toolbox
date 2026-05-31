import { Globe, Loader2, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTunnelStatus } from '../hooks/useTunnelStatus'
import { useTunnelControl } from '../hooks/useTunnelControl'
import { TunnelUrlCard } from '../components/TunnelUrlCard'
import { AuthPromptCard } from '../components/AuthPromptCard'
import { RunningTunnelPanel } from '../components/RunningTunnelPanel'

export function VsCodeTunnelPage() {
  const { status, conn } = useTunnelStatus()
  const { start, stop, pending, error } = useTunnelControl()

  const state = status?.state ?? 'STOPPED'
  const busy = state === 'STARTING' || state === 'STOPPING' || pending !== null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <Globe className="size-6 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-xl font-semibold">VS Code Tunnel</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            在手机浏览器远程操作本机 VS Code（含已装扩展）
          </p>
        </div>
      </header>

      {conn === 'error' && (
        <Card>
          <CardContent className="text-sm text-[var(--color-destructive)]">
            后端事件流断开，正在自动重连…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="text-sm text-[var(--color-destructive)] whitespace-pre-wrap">
            {error}
          </CardContent>
        </Card>
      )}

      <RunningTunnelPanel status={status} />

      {state === 'STOPPED' && (
        <Card>
          <CardHeader>
            <CardTitle>未启动</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              点击下方按钮启动 <code>code tunnel</code> 进程。首次启动会要求在 GitHub 完成一次设备登录授权，
              之后凭证会缓存在本机 <code>~/.vscode-cli/</code>，再次启动自动连接。
            </p>
            <Button onClick={() => start({})} disabled={busy}>
              {pending === 'start' ? <Loader2 className="animate-spin" /> : <Play />}
              启动隧道
            </Button>
          </CardContent>
        </Card>
      )}

      {state === 'STARTING' && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin" />
            正在启动 code tunnel 进程…
          </CardContent>
        </Card>
      )}

      {state === 'AUTH_REQUIRED' && status?.deviceCode && (
        <AuthPromptCard
          deviceCode={status.deviceCode}
          deviceLoginUrl={status.deviceLoginUrl}
          tunnelName={status.tunnelName}
        />
      )}

      {state === 'RUNNING' && status?.tunnelUrl && (
        <TunnelUrlCard
          url={status.tunnelUrl}
          tunnelName={status.tunnelName}
          startedAt={status.startedAt}
          onStop={() => stop()}
          stopping={pending === 'stop'}
        />
      )}

      {state === 'STOPPING' && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm">
            <Loader2 className="size-4 animate-spin" />
            正在停止隧道…
          </CardContent>
        </Card>
      )}

      {state === 'ERROR' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--color-destructive)]">隧道异常</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--color-muted)] p-3 text-xs">
              {status?.lastError ?? '未知错误'}
            </pre>
            <Button onClick={() => start({})} disabled={busy}>
              {pending === 'start' ? <Loader2 className="animate-spin" /> : <Play />}
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">安全提示</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-[var(--color-muted-foreground)] leading-relaxed">
          <p>1. 隧道走 GitHub OAuth 鉴权，<strong className="text-[var(--color-foreground)]">务必为 GitHub 账号开启 2FA</strong>。</p>
          <p>2. 不用时点「停止隧道」或关掉 kai-toolbox 进程，避免长跑暴露面。</p>
          <p>3. 在 VS Code 里打开的工作目录及其子目录都对远端可见，避免含 <code>.env</code>、私钥的目录。</p>
          {state === 'STOPPED' && pending !== 'stop' && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => stop()}>
              <Square />
              强制清理（如果命令行残留 code tunnel 进程）
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Skull } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError, http } from '@/lib/api'

interface PortProcessEntry {
  protocol: string
  family: string | null
  localAddress: string
  localPort: number
  remoteAddress: string | null
  state: string | null
  pid: number | null
  processName: string | null
  command: string | null
}

interface PortLookupResult {
  port: number
  os: string
  command: string
  elapsedMs: number
  entries: PortProcessEntry[]
}

interface KillResult {
  pid: number
  killed: boolean
  os: string
  command: string
  exitCode: number
  stdout: string | null
  stderr: string | null
  elapsedMs: number
}

export function PortProcessPage() {
  const [portInput, setPortInput] = useState('')
  const [killing, setKilling] = useState<number | null>(null)
  const [killOutcome, setKillOutcome] = useState<{ pid: number; killed: boolean; stderr: string | null } | null>(null)
  const confirm = useConfirm()

  const mutation = useMutation<PortLookupResult, ApiError, number>({
    mutationFn: (port) => http<PortLookupResult>(`/port-process?port=${port}`),
  })

  async function handleKill(entry: PortProcessEntry) {
    if (entry.pid == null) return
    const ok = await confirm({
      title: '终止进程',
      description: (
        <div className="space-y-1 text-sm">
          <div>
            将向 <code className="font-mono">PID {entry.pid}</code>
            {entry.processName ? <> (<span className="font-mono">{entry.processName}</span>)</> : null}
            发送强制终止信号。
          </div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            占用 {entry.localAddress}:{entry.localPort} ({entry.protocol}{entry.state ? `, ${entry.state}` : ''})
          </div>
        </div>
      ),
      confirmText: '强制终止',
      variant: 'destructive',
    })
    if (!ok) return
    setKilling(entry.pid)
    setKillOutcome(null)
    try {
      const r = await http<KillResult>(`/port-process/kill?pid=${entry.pid}&force=true`, { method: 'POST' })
      setKillOutcome({ pid: r.pid, killed: r.killed, stderr: r.stderr })
      if (r.killed) {
        // 重新查询当前端口，让被杀的行从表格消失
        const portNow = Number(portInput.trim())
        if (Number.isInteger(portNow) && portNow >= 1 && portNow <= 65535) {
          mutation.mutate(portNow)
        }
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err)
      setKillOutcome({ pid: entry.pid, killed: false, stderr: msg })
    } finally {
      setKilling(null)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const port = Number(portInput.trim())
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      mutation.reset()
      return
    }
    mutation.mutate(port)
  }

  const portValid = (() => {
    if (portInput.trim() === '') return null
    const n = Number(portInput.trim())
    return Number.isInteger(n) && n >= 1 && n <= 65535
  })()

  const result = mutation.data
  const error = mutation.error

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>端口进程查询</CardTitle>
          <CardDescription>
            输入本机端口号，反查占用进程。后端按运行环境自动选择 netstat / lsof / ss，
            同时返回 IPv4 与 IPv6 监听项。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex items-center gap-2" onSubmit={submit}>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="端口号 (1-65535)，例如 8080"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              className="max-w-xs"
              aria-invalid={portValid === false}
            />
            <Button type="submit" disabled={!portValid || mutation.isPending}>
              {mutation.isPending ? '查询中…' : '查询'}
            </Button>
            {portValid === false && (
              <span className="text-xs text-[var(--color-destructive)]">端口必须是 1-65535 的整数</span>
            )}
          </form>

          {error && (
            <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
              查询失败：{error.message}
            </div>
          )}

          {killOutcome && (
            killOutcome.killed ? (
              <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                PID {killOutcome.pid} 已终止
              </div>
            ) : (
              <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)] space-y-1">
                <div>PID {killOutcome.pid} 终止失败</div>
                {killOutcome.stderr && (
                  <pre className="whitespace-pre-wrap text-xs opacity-80">{killOutcome.stderr}</pre>
                )}
              </div>
            )
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                <Badge variant="outline">OS: {result.os}</Badge>
                <Badge variant="outline">耗时: {result.elapsedMs} ms</Badge>
                <Badge variant="outline">命中: {result.entries.length} 条</Badge>
                <code className="rounded bg-[var(--color-muted)]/40 px-2 py-0.5">{result.command}</code>
              </div>

              {result.entries.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  没有进程占用端口 {result.port}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="px-3 py-2">协议</th>
                        <th className="px-3 py-2">协议族</th>
                        <th className="px-3 py-2">本地地址</th>
                        <th className="px-3 py-2">远端地址</th>
                        <th className="px-3 py-2">状态</th>
                        <th className="px-3 py-2">PID</th>
                        <th className="px-3 py-2">进程</th>
                        <th className="px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.entries.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{e.protocol}</td>
                          <td className="px-3 py-2">
                            <Badge variant={e.family === 'IPv6' ? 'secondary' : 'outline'}>
                              {e.family ?? '-'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{e.localAddress}:{e.localPort}</td>
                          <td className="px-3 py-2 font-mono text-xs text-[var(--color-muted-foreground)]">
                            {e.remoteAddress ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-xs">{e.state ?? '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{e.pid ?? '-'}</td>
                          <td className="px-3 py-2 text-xs">{e.processName ?? '-'}</td>
                          <td className="px-3 py-2">
                            {e.pid != null && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={killing === e.pid}
                                onClick={() => handleKill(e)}
                              >
                                <Skull />
                                {killing === e.pid ? '终止中…' : '杀'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

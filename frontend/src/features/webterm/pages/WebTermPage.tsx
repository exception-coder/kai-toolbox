import { useState } from 'react'
import { RotateCcw, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Terminal } from '../components/Terminal'
import type { ShellKind } from '../types'

export function WebTermPage() {
  const [shell, setShell] = useState<ShellKind>('powershell')
  const [cwd, setCwd] = useState<string>('')
  const [reconnectKey, setReconnectKey] = useState(0)
  const [state, setState] = useState<string>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleReconnect = () => {
    setErrorMsg(null)
    setReconnectKey(k => k + 1)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TerminalSquare className="size-4" />
            Web 终端
            <span className="ml-auto text-xs font-normal text-[var(--color-muted-foreground)]">
              状态：{state}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-muted-foreground)]">Shell</label>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setShell('powershell')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  shell === 'powershell'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                PowerShell
              </button>
              <button
                type="button"
                onClick={() => setShell('cmd')}
                className={`border-l px-3 py-1.5 text-sm transition-colors ${
                  shell === 'cmd'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                cmd
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1 min-w-[260px]">
            <label className="text-xs text-[var(--color-muted-foreground)]">
              起始目录（留空 = 用户目录）
            </label>
            <Input
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder="C:\\Users\\..."
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={handleReconnect} variant="outline">
            <RotateCcw />
            重新连接
          </Button>
        </CardContent>
      </Card>

      {errorMsg && (
        <div className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-hidden rounded-md border bg-[#1a1b26]">
        <Terminal
          key={reconnectKey + ':' + shell + ':' + cwd}
          shell={shell}
          cwd={cwd || null}
          onStateChange={setState}
          onError={(code, message) => setErrorMsg(`${code}: ${message}`)}
        />
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        提示：本期不接入 PTY，全屏程序（vim / htop / less / git log 分页）渲染异常属预期；按下 Ctrl+C 中断的可靠性弱于本地终端，可点「重新连接」强制重启进程。
      </p>
    </div>
  )
}

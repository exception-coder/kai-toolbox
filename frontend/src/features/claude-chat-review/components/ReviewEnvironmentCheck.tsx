import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  checkPublicReviewEnvironment,
  type PublicReviewEnvironmentCheck,
} from '@/features/claude-chat/public-api'

type ConnectionState = 'idle' | 'connecting' | 'ready' | 'closed' | 'error'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  connectionState: ConnectionState
}

export function ReviewEnvironmentCheck({ open, onOpenChange, token, connectionState }: Props) {
  const [result, setResult] = useState<PublicReviewEnvironmentCheck | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await checkPublicReviewEnvironment(token))
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : '环境检测暂时不可用')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (open) void check()
  }, [open, check])

  const checks = useMemo(() => {
    const serverChecks = result?.checks ?? []
    const replyCheck = connectionState === 'ready'
      ? { key: 'reply', label: '回复连接', status: 'PASS' as const, message: '当前页面已连接，可以发送问题和截图' }
      : connectionState === 'connecting'
        ? { key: 'reply', label: '回复连接', status: 'WARN' as const, message: '正在重新连接，请稍候再发送；长时间未恢复可刷新页面' }
        : { key: 'reply', label: '回复连接', status: 'FAIL' as const, message: '当前页面未连接，请刷新后重试' }
    return [...serverChecks, replyCheck]
  }, [result, connectionState])

  const ready = result?.status === 'READY' && connectionState === 'ready'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-none flex-col p-0 sm:w-[28rem] sm:max-w-[90vw]">
        <div className="border-b px-5 py-4 pr-12">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[var(--color-primary)]" />
            <SheetTitle>评审环境检测</SheetTitle>
          </div>
          <SheetDescription className="mt-1">
            检查截图为什么可能无法识别；不会发送消息、调用 AI 或修改评审内容。
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && !result && (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />正在检查评审环境…
            </div>
          )}

          {error && (
            <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>
              <Button size="sm" variant="ghost" onClick={() => void check()} className="mt-2 gap-1.5">
                <RefreshCw className="size-3.5" />重新检测
              </Button>
            </div>
          )}

          {!error && result && (
            <>
              <div className="mb-5 flex items-start gap-2 border-b pb-4">
                {ready ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />}
                <div>
                  <p className="font-medium">{ready ? '评审环境可用' : '发现需要处理的项目'}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {ready ? '可以继续上传截图，AI 会直接识别图片内容。' : '按下方提示恢复后再上传截图；已有评审内容不会丢失。'}
                  </p>
                </div>
              </div>

              <div className="divide-y">
                {checks.map(item => (
                  <div key={item.key} className="flex items-start gap-3 py-3">
                    {item.status === 'PASS'
                      ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      : item.key === 'reply' ? <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-sm leading-5 text-[var(--color-muted-foreground)]">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">检测结果不包含本机路径或运行参数</p>
          <Button size="sm" variant="outline" onClick={() => void check()} disabled={loading} className="shrink-0 gap-1.5">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            再次检测
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

import { Button } from '@/components/ui/button'
import { ShieldQuestion } from 'lucide-react'

interface Props {
  toolName: string
  input: unknown
  onAllow: () => void
  onDeny: () => void
}

/** 工具权限批准弹窗（复刻插件 allow/deny 体验）。 */
export function PermissionDialog({ toolName, input, onAllow, onDeny }: Props) {
  return (
    <Overlay>
      <div className="mb-3 flex items-center gap-2">
        <ShieldQuestion className="size-5 text-[var(--color-primary)]" />
        <h3 className="text-base font-semibold">Claude 想使用工具</h3>
      </div>
      <p className="mb-2 text-sm">
        工具：<span className="font-mono font-medium">{toolName}</span>
      </p>
      <pre className="mb-4 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--color-muted)] p-3 text-xs">
        {safeJson(input)}
      </pre>
      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onDeny}>
          拒绝
        </Button>
        <Button size="lg" className="flex-1 shadow-md" onClick={onAllow}>
          允许
        </Button>
      </div>
    </Overlay>
  )
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-background)] p-4 shadow-xl">
        {children}
      </div>
    </div>
  )
}

function safeJson(v: unknown): string {
  if (v == null) return ''
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

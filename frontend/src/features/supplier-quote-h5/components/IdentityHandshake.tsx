import { Check, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IdentityHandshakePhase = 'CONNECTING' | 'VERIFYING' | 'READY'

interface IdentityHandshakeProps {
  phase: IdentityHandshakePhase
}

const stages = [
  { key: 'CONNECTING', label: '建立安全连接' },
  { key: 'VERIFYING', label: '获取本轮询价' },
  { key: 'READY', label: '准备报价页面' },
] as const

const phaseIndex: Record<IdentityHandshakePhase, number> = {
  CONNECTING: 0,
  VERIFYING: 1,
  READY: 2,
}

export function IdentityHandshake({ phase }: IdentityHandshakeProps) {
  const currentIndex = phaseIndex[phase]
  const ready = phase === 'READY'

  return (
    <section
      className="w-full max-w-sm text-center"
      role="status"
      aria-live="polite"
      aria-label={ready ? '报价单准备完成' : '正在准备报价单'}
    >
      <div className="sq-handshake" aria-hidden="true">
        <div className="sq-handshake-node sq-handshake-brand">R</div>
        <div className={cn('sq-handshake-track', ready && 'is-ready')}>
          <span className="sq-handshake-dot" />
          {ready && (
            <span className="sq-handshake-check">
              <Check className="size-3.5 stroke-[3]" />
            </span>
          )}
        </div>
        <div className="sq-handshake-node sq-handshake-wechat">
          <MessageCircle className="size-4" />
          <span>微信</span>
        </div>
      </div>

      <div className="mt-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          {ready ? '准备完成' : '正在准备您的报价单'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {ready ? '正在进入本轮报价' : '正在安全确认您的微信身份'}
        </p>
        {!ready && <p className="mt-0.5 text-xs text-slate-400">无需任何操作</p>}
      </div>

      <ol className="mx-auto mt-9 w-48 space-y-3 text-left" aria-label="准备进度">
        {stages.map((stage, index) => {
          const complete = index < currentIndex || ready
          const active = index === currentIndex && !ready
          return (
            <li
              key={stage.key}
              className={cn(
                'flex items-center gap-3 text-xs transition-colors duration-300',
                complete || active ? 'text-slate-800' : 'text-slate-400',
              )}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border',
                  complete && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                  active && 'sq-stage-active border-slate-900 bg-slate-900',
                  !complete && !active && 'border-slate-300 bg-transparent',
                )}
              >
                {complete && <Check className="size-2.5 stroke-[3]" />}
              </span>
              <span className={cn(active && 'font-medium')}>{stage.label}</span>
            </li>
          )
        })}
      </ol>

      <p className="mt-12 text-[11px] tracking-wide text-slate-400">
        Regen-tech · 安全报价服务
      </p>
    </section>
  )
}

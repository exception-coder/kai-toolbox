import { useState, type ComponentType } from 'react'
import { Check, ClipboardList, Shield, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Overlay } from './PermissionDialog'
import type { PermissionMode } from '../types'

/** 展示顺序，复刻 VSCode 插件 Shift+Tab 体验（弹层里也按此序）。 */
const ORDER: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

const META: Record<PermissionMode, {
  label: string
  desc: string
  icon: ComponentType<{ className?: string }>
  cls: string
}> = {
  default: { label: '默认', desc: '每次工具调用前都征求你同意', icon: Shield, cls: '' },
  acceptEdits: { label: '自动接受', desc: '自动放行文件编辑，其余仍逐个询问', icon: Zap, cls: 'text-[var(--color-primary)]' },
  plan: { label: '计划', desc: '只探索代码并给出计划，不直接改动', icon: ClipboardList, cls: 'text-blue-600' },
  bypassPermissions: { label: '全自动', desc: '所有工具调用都不再询问，直接执行', icon: ShieldAlert, cls: 'text-emerald-600 dark:text-emerald-400' },
}

/**
 * 权限模式切换：点击弹出卡片列表（图标 + 标题 + 描述 + 当前项打勾），复刻官方 VSCode 插件的 Modes 弹层。
 * 切到「全自动」(bypassPermissions) 前弹自定义确认框（不用浏览器原生 confirm），防误开。
 */
export function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: PermissionMode
  onChange: (m: PermissionMode) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const m = META[mode]
  const Icon = m.icon

  const pick = (target: PermissionMode) => {
    setOpen(false)
    if (target === 'bypassPermissions' && mode !== 'bypassPermissions') {
      setConfirming(true) // 切「全自动」前确认
      return
    }
    onChange(target)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={'flex items-center gap-1 rounded-md border px-2 py-1 text-sm ' + m.cls}
        title="权限模式（点击切换）"
        aria-label={`权限模式 ${m.label}，点击切换`}
      >
        <Icon className="size-4" /> {m.label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl">
            <div className="px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)]">权限模式</div>
            {ORDER.map(opt => {
              const o = META[opt]
              const OIcon = o.icon
              const active = opt === mode
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pick(opt)}
                  className={'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)] '
                    + (active ? 'bg-[var(--color-muted)]' : '')}
                >
                  <OIcon className={'mt-0.5 size-4 shrink-0 ' + o.cls} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-[var(--color-muted-foreground)]">{o.desc}</span>
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
                </button>
              )
            })}
          </div>
        </>
      )}

      {confirming && (
        <Overlay>
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="size-5 text-red-600" />
            <h3 className="text-base font-semibold">开启「全自动」模式？</h3>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            开启后 Claude 的所有工具调用都<strong className="text-[var(--color-foreground)]">不再询问</strong>，
            可能直接改文件 / 执行命令。请确认你信任当前任务再开启。
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button
              size="lg"
              className="flex-1 bg-red-600 text-white shadow-md hover:bg-red-700"
              onClick={() => {
                setConfirming(false)
                onChange('bypassPermissions')
              }}
            >
              开启全自动
            </Button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

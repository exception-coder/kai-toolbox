import { useState, type ComponentType } from 'react'
import { Check, ClipboardList, Shield, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Overlay } from './PermissionDialog'
import type { Engine, PermissionMode } from '../types'
import { permissionModesForEngine } from './permissionModes'

const VISUAL_META: Record<PermissionMode, {
  icon: ComponentType<{ className?: string }>
  cls: string
}> = {
  default: { icon: Shield, cls: '' },
  acceptEdits: { icon: Zap, cls: 'text-[var(--color-primary)]' },
  plan: { icon: ClipboardList, cls: 'text-blue-600' },
  bypassPermissions: { icon: ShieldAlert, cls: 'text-emerald-600 dark:text-emerald-400' },
}

/**
 * 权限模式切换：点击弹出卡片列表（图标 + 标题 + 描述 + 当前项打勾），复刻官方 VSCode 插件的 Modes 弹层。
 * 切到「全自动」(bypassPermissions) 前弹自定义确认框（不用浏览器原生 confirm），防误开。
 */
export function ModeSwitch({
  engine,
  mode,
  onChange,
  disabled,
  inlineConfirmation = false,
}: {
  engine: Engine
  mode: PermissionMode
  onChange: (m: PermissionMode) => void
  disabled?: boolean
  /** 在父级 modal 内使用时就地确认，避免把二级 Overlay portal 到父 modal 之外。 */
  inlineConfirmation?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const options = permissionModesForEngine(engine)
  const current = options.find(option => option.value === mode) ?? options[0]
  const visual = VISUAL_META[current.value]
  const Icon = visual.icon

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
        className={'flex items-center gap-1 rounded-md border px-2 py-1 text-sm ' + visual.cls}
        title="权限模式（点击切换）"
        aria-label={`权限模式 ${current.label}，点击切换`}
      >
        <Icon className="size-4" /> {current.label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl">
            <div className="px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)]">权限模式</div>
            {options.map(option => {
              const optionVisual = VISUAL_META[option.value]
              const OIcon = optionVisual.icon
              const active = option.value === current.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pick(option.value)}
                  className={'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)] '
                    + (active ? 'bg-[var(--color-muted)]' : '')}
                >
                  <OIcon className={'mt-0.5 size-4 shrink-0 ' + optionVisual.cls} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-[var(--color-muted-foreground)]">{option.desc}</span>
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
                </button>
              )
            })}
          </div>
        </>
      )}

      {confirming && (inlineConfirmation ? (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50/80 p-3 dark:border-red-900 dark:bg-red-950/40">
          <ModeConfirmation
            engine={engine}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              onChange('bypassPermissions')
            }}
          />
        </div>
      ) : (
        <Overlay>
          <ModeConfirmation
            engine={engine}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              onChange('bypassPermissions')
            }}
          />
        </Overlay>
      ))}
    </div>
  )
}

function ModeConfirmation({
  engine,
  onCancel,
  onConfirm,
}: {
  engine: Engine
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="size-5 text-red-600" />
        <h3 className="text-base font-semibold">
          开启「{engine === 'codex' ? '完全访问权限' : '全自动'}」模式？
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
        开启后 {engine === 'codex' ? 'Codex' : 'Claude'} 的所有工具调用都<strong className="text-[var(--color-foreground)]">不再询问</strong>，
        可能直接改文件 / 执行命令。请确认你信任当前任务再开启。
      </p>
      <div className="mt-4 flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-red-600 text-white shadow-md hover:bg-red-700"
          onClick={onConfirm}
        >
          {engine === 'codex' ? '开启完全访问权限' : '开启全自动'}
        </Button>
      </div>
    </>
  )
}

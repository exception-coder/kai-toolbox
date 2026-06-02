import { useState, type ComponentType } from 'react'
import { ClipboardList, Shield, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Overlay } from './PermissionDialog'
import type { PermissionMode } from '../types'

/** 点击循环顺序，复刻 VSCode 插件 Shift+Tab 体验。 */
const ORDER: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

const META: Record<PermissionMode, { label: string; icon: ComponentType<{ className?: string }>; cls: string }> = {
  default: { label: '默认', icon: Shield, cls: '' },
  acceptEdits: { label: '自动接受', icon: Zap, cls: 'text-[var(--color-primary)]' },
  plan: { label: '计划', icon: ClipboardList, cls: 'text-blue-600' },
  bypassPermissions: { label: '全自动', icon: ShieldAlert, cls: 'border-red-500 text-red-600 font-medium' },
}

/**
 * 权限模式切换：点击在 默认 → 自动接受 → 计划 → 全自动 间循环。
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
  const [confirming, setConfirming] = useState(false)

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    if (next === 'bypassPermissions') {
      setConfirming(true) // 弹自定义确认框，确认后才切换
      return
    }
    onChange(next)
  }

  const m = META[mode]
  const Icon = m.icon
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={cycle}
        className={m.cls}
        title={`权限模式：${m.label}（点击切换）`}
        aria-label={`权限模式 ${m.label}，点击切换`}
      >
        <Icon className="size-4" /> {m.label}
      </Button>

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
    </>
  )
}

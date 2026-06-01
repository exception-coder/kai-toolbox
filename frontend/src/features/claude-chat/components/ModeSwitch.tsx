import type { ComponentType } from 'react'
import { ClipboardList, Shield, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
 * 切到「全自动」(bypassPermissions) 前二次确认，防误开导致工具无询问执行。
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
  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    if (next === 'bypassPermissions') {
      const ok = window.confirm('开启「全自动」后，Claude 的所有工具调用都不再询问，可能直接改文件 / 执行命令。确定开启？')
      if (!ok) {
        onChange('default') // 跳过全自动，回到默认
        return
      }
    }
    onChange(next)
  }

  const m = META[mode]
  const Icon = m.icon
  return (
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
  )
}

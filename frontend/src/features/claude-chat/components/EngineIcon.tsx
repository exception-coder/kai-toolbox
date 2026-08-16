import { Zap } from 'lucide-react'
import { RiOpenaiFill } from 'react-icons/ri'
import { SiClaude, SiDeepseek, SiGoogle, SiOpencode } from 'react-icons/si'
import type { IconType } from 'react-icons'
import { cn } from '@/lib/utils'
import type { Engine } from '../types'

/**
 * 引擎品牌图标 + 品牌色。
 *
 * 用各厂商自己的商标（react-icons 的 Simple Icons / Remix 集）而不是通用 lucide 图标：
 * 引擎是「谁在干活」这个信息里最需要一眼认出的部分，品牌形状的识别成本远低于读文字，
 * 窄屏下也能把文字标签整个省掉。之前 SessionList 用 Bot / Code2 / Sparkles 顶替，
 * 各引擎均使用独立品牌图标，窄屏下也能省略文字标签。
 */
const ENGINE_ICONS: Record<Engine, IconType> = {
  claude: SiClaude,
  codex: RiOpenaiFill,
  antigravity: SiGoogle,
  opencode: SiOpencode,
  deepseekHarness: SiDeepseek,
}

/** 品牌主色（暗色模式下调亮一档保证对比度）。 */
const ENGINE_COLORS: Record<Engine, string> = {
  claude: 'text-[#d97757]',
  codex: 'text-[#0f9d76] dark:text-[#19c37d]',
  antigravity: 'text-[#7c3aed] dark:text-[#a78bfa]',
  opencode: 'text-[var(--color-foreground)]',
  deepseekHarness: 'text-[#4d6bfe] dark:text-[#7f96ff]',
}

export function engineIconOf(engine: string): IconType {
  return ENGINE_ICONS[engine as Engine] ?? SiClaude
}

export function engineColorOf(engine: string): string {
  return ENGINE_COLORS[engine as Engine] ?? ENGINE_COLORS.claude
}

/** 将用户可见名称还原为稳定引擎 ID；不要用 toLowerCase 猜 camelCase ID。 */
export function engineIdFromDisplayName(label?: string): Engine {
  const normalized = label?.split(' ·', 1)[0].trim().toLowerCase()
  if (normalized === 'codex') return 'codex'
  if (normalized === 'antigravity') return 'antigravity'
  if (normalized === 'opencode') return 'opencode'
  if (normalized === 'deepseek harness') return 'deepseekHarness'
  return 'claude'
}

/**
 * 单个引擎图标。thirdParty=true 时右下角叠一枚琥珀色闪电角标，
 * 表示「同一引擎但走第三方网关」——这是引擎之外的正交维度，不该挤掉品牌本身。
 */
export function EngineIcon({
  engine,
  thirdParty,
  className,
  muted,
  title,
  'aria-label': ariaLabel,
}: {
  engine: string
  thirdParty?: boolean
  className?: string
  /** 安静态：降饱和，用于列表等不该抢视觉的位置。 */
  muted?: boolean
  /** 悬浮说明；只剩图标时这是唯一能看到引擎全名的地方，别省。 */
  title?: string
  'aria-label'?: string
}) {
  const Icon = engineIconOf(engine)
  return (
    <span className="relative inline-flex shrink-0" title={title} aria-label={ariaLabel ?? title} role={ariaLabel ?? title ? 'img' : undefined}>
      <Icon className={cn('shrink-0', engineColorOf(engine), muted && 'opacity-60', className)} />
      {thirdParty && (
        <Zap
          className="absolute -bottom-0.5 -right-1 size-2 fill-amber-500 text-amber-500"
          aria-hidden
        />
      )}
    </span>
  )
}

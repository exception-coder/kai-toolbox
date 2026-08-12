import { useState } from 'react'
import { ChevronDown, ExternalLink, PanelTopOpen, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { QuickSiteOpenMode, QuickSiteWindowBehavior } from '@/lib/quickSites'

export interface SiteOpenChoice {
  openMode: QuickSiteOpenMode
  windowBehavior: QuickSiteWindowBehavior
}

interface Props {
  onSelect: (choice: SiteOpenChoice) => void
  compact?: boolean
  allowControlled?: boolean
}

const CHOICES: Array<SiteOpenChoice & { label: string; hint: string; icon: typeof ShieldCheck }> = [
  { openMode: 'POPUP', windowBehavior: 'CONTROLLED', label: '受控窗口', hint: '阻止站点派生新窗口', icon: ShieldCheck },
  { openMode: 'POPUP', windowBehavior: 'STANDARD', label: '独立窗口', hint: '保留站点完整能力', icon: PanelTopOpen },
  { openMode: 'TAB', windowBehavior: 'STANDARD', label: '新标签页', hint: '完整地址栏，推荐 ERP', icon: ExternalLink },
]

/** 为本次站点启动临时选择模式，不修改快捷入口的默认配置。 */
export function SiteOpenModeMenu({ onSelect, compact = false, allowControlled = true }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={compact ? 'size-5 rounded-full' : 'size-7'}
          title="选择本次打开模式"
          aria-label="选择本次打开模式"
        >
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        {CHOICES.filter(choice => allowControlled || choice.windowBehavior !== 'CONTROLLED').map(choice => {
          const Icon = choice.icon
          return (
            <button
              key={`${choice.openMode}-${choice.windowBehavior}`}
              type="button"
              className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-[var(--color-muted)]"
              onClick={() => {
                setOpen(false)
                onSelect(choice)
              }}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-medium">{choice.label}</span>
                <span className="block text-[10px] text-[var(--color-muted-foreground)]">{choice.hint}</span>
              </span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

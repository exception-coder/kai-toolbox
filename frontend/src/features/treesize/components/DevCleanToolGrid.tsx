import { HardDrive } from 'lucide-react'
import { FaQq, FaWeixin, FaWindows } from 'react-icons/fa'
import { TbBrandDingtalk } from 'react-icons/tb'
import {
  SiClaude,
  SiBytedance,
  SiGooglechrome,
  SiGradle,
  SiJetbrains,
  SiNpm,
  SiOllama,
  SiPostman,
  SiPypi,
} from 'react-icons/si'
import { VscVscode } from 'react-icons/vsc'
import type { IconType } from 'react-icons'
import { formatBytes, formatNumber } from '@/lib/utils'

export interface DevCleanToolSummary {
  name: string
  bytes: number
  selectedBytes: number
  recipeCount: number
}

interface BrandVisual {
  icon: IconType
  color: string
  title: string
}

const TOOL_VISUALS: Record<string, { brands: BrandVisual[]; tint: string; label: string }> = {
  'VS Code': {
    brands: [{ icon: VscVscode, color: '#007ACC', title: 'Visual Studio Code' }],
    tint: 'from-[#007ACC]/14 to-[#23A8F2]/5',
    label: 'VS',
  },
  'AI 桌面端': {
    brands: [
      { icon: SiClaude, color: '#D97757', title: 'Claude' },
      { icon: SiOllama, color: '#111111', title: 'Ollama' },
    ],
    tint: 'from-[#D97757]/15 to-[#F0A78E]/5',
    label: 'AI',
  },
  包管理器: {
    brands: [
      { icon: SiNpm, color: '#CB3837', title: 'npm' },
      { icon: SiPypi, color: '#3775A9', title: 'PyPI' },
      { icon: SiGradle, color: '#02303A', title: 'Gradle' },
    ],
    tint: 'from-[#CB3837]/12 to-[#3775A9]/5',
    label: 'PKG',
  },
  IDE: {
    brands: [{ icon: SiJetbrains, color: '#000000', title: 'JetBrains' }],
    tint: 'from-[#FF007F]/14 via-[#FF8A00]/7 to-[#6B57FF]/8',
    label: 'IDE',
  },
  'API 工具': {
    brands: [{ icon: SiPostman, color: '#FF6C37', title: 'Postman' }],
    tint: 'from-[#FF6C37]/14 to-[#FFB199]/5',
    label: 'API',
  },
  系统临时文件: {
    brands: [{ icon: FaWindows, color: '#0078D4', title: 'Windows' }],
    tint: 'from-[#0078D4]/13 to-[#00A4EF]/5',
    label: 'TMP',
  },
  浏览器: {
    brands: [{ icon: SiGooglechrome, color: '#4285F4', title: 'Google Chrome' }],
    tint: 'from-[#4285F4]/12 via-[#34A853]/6 to-[#FBBC05]/7',
    label: 'WEB',
  },
  '微信 / QQ': {
    brands: [
      { icon: FaWeixin, color: '#07C160', title: '微信' },
      { icon: FaQq, color: '#12B7F5', title: 'QQ' },
    ],
    tint: 'from-[#07C160]/14 to-[#12B7F5]/6',
    label: 'IM',
  },
  飞书: {
    brands: [{ icon: SiBytedance, color: '#3370FF', title: '飞书（字节跳动）' }],
    tint: 'from-[#3370FF]/14 to-[#00D6B9]/6',
    label: 'LARK',
  },
  钉钉: {
    brands: [{ icon: TbBrandDingtalk, color: '#0089FF', title: '钉钉' }],
    tint: 'from-[#0089FF]/14 to-[#66B9FF]/6',
    label: 'DING',
  },
  'Windows 用户缓存': {
    brands: [{ icon: FaWindows, color: '#0078D4', title: 'Windows' }],
    tint: 'from-[#0078D4]/13 to-[#00A4EF]/5',
    label: 'WIN',
  },
}

export function DevCleanToolGrid({
  tools,
  activeTool,
  sortMode,
  title = '选择应用',
  description = '点击图标查看缓存与文件明细',
  onSelect,
  onSortChange,
}: {
  tools: DevCleanToolSummary[]
  activeTool: string | null
  sortMode: 'size' | 'name'
  title?: string
  description?: string
  onSelect: (name: string) => void
  onSortChange: (mode: 'size' | 'name') => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            {description}
          </p>
        </div>
        <div className="flex rounded-md border bg-[var(--color-background)] p-0.5">
          <SortButton active={sortMode === 'size'} onClick={() => onSortChange('size')}>
            按占用
          </SortButton>
          <SortButton active={sortMode === 'name'} onClick={() => onSortChange('name')}>
            按名称
          </SortButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tools.map(tool => {
          const visual = TOOL_VISUALS[tool.name] ?? {
            brands: [],
            tint: 'from-slate-500/10 to-slate-700/5',
            label: tool.name.slice(0, 3),
          }
          const active = activeTool === tool.name
          return (
            <button
              key={tool.name}
              type="button"
              onClick={() => onSelect(tool.name)}
              className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br ${visual.tint} p-3 text-left transition-all duration-200 ${
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/7 shadow-md ring-1 ring-[var(--color-primary)]/25'
                  : 'hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md'
              }`}
            >
              <div className="flex h-11 items-center">
                {visual.brands.length > 0 ? (
                  <div className="flex -space-x-2">
                    {visual.brands.map(({ icon: BrandIcon, color, title }) => (
                      <span
                        key={title}
                        title={title}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white shadow-sm transition-transform group-hover:-translate-y-0.5 dark:bg-slate-950"
                      >
                        <BrandIcon className="h-6 w-6" style={{ color }} />
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white shadow-sm dark:bg-slate-950">
                    <HardDrive className="h-5 w-5 text-slate-600" />
                  </span>
                )}
              </div>
              <div className="mt-3 truncate text-sm font-semibold">{tool.name}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{formatBytes(tool.bytes)}</div>
              <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                <span>{formatNumber(tool.recipeCount)} 个清理项</span>
                {tool.selectedBytes > 0 && (
                  <span className="text-[var(--color-primary)]">
                    已选 {formatBytes(tool.selectedBytes)}
                  </span>
                )}
              </div>
              <span className="absolute right-2 top-2 text-[9px] font-bold tracking-wider text-[var(--color-muted-foreground)]/50">
                {visual.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
      }`}
    >
      {children}
    </button>
  )
}

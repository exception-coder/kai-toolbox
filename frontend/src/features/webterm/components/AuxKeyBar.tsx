import {
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Delete,
  MoveDown,
  MoveUp,
} from 'lucide-react'

interface AuxKeyBarProps {
  onSend: (data: string) => void
}

interface AuxKey {
  label: string | React.ReactNode
  data: string
  title: string
  tone?: 'default' | 'danger' | 'primary'
  className?: string
}

// 移动端 OS 软键盘上没有的常用控制键。按 Shell 编辑频率排序，保证拇指最先摸到高频键。
// onPointerDown preventDefault 防止按按钮时 xterm 失焦、系统键盘被收起。
const KEYS: AuxKey[] = [
  { label: 'Esc', data: '\x1b', title: 'Esc' },
  { label: 'Tab', data: '\t', title: 'Tab' },
  {
    label: <CornerDownLeft className="size-4" />,
    data: '\r',
    title: 'Enter',
    tone: 'primary',
  },
  { label: <MoveUp className="size-3.5" />, data: '\x1b[A', title: '上箭头 / 历史上一条' },
  { label: <MoveDown className="size-3.5" />, data: '\x1b[B', title: '下箭头 / 历史下一条' },
  { label: <ChevronLeft className="size-3.5" />, data: '\x1b[D', title: '左箭头' },
  { label: <ChevronRight className="size-3.5" />, data: '\x1b[C', title: '右箭头' },
  { label: '^A', data: '\x01', title: 'Ctrl+A 行首' },
  { label: '^E', data: '\x05', title: 'Ctrl+E 行尾' },
  { label: '^U', data: '\x15', title: 'Ctrl+U 清空当前行' },
  { label: '^K', data: '\x0b', title: 'Ctrl+K 删除到行尾' },
  { label: <Delete className="size-3.5" />, data: '\x7f', title: 'Backspace (Delete)' },
  {
    label: '^C',
    data: '\x03',
    title: 'Ctrl+C 中断当前任务',
    tone: 'danger',
  },
  { label: '^L', data: '\f', title: 'Ctrl+L 清屏' },
  { label: 'Home', data: '\x1b[H', title: 'Home' },
  { label: 'End', data: '\x1b[F', title: 'End' },
]

export function AuxKeyBar({ onSend }: AuxKeyBarProps) {
  return (
    <div
      className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-white/10 bg-[#151722] px-2 py-2 no-scrollbar md:hidden"
      onPointerDown={e => {
        // 防止按钮抢走 xterm 隐藏 textarea 的焦点，避免系统键盘忽然收起
        if ((e.target as HTMLElement).closest('button')) {
          e.preventDefault()
        }
      }}
    >
      {KEYS.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSend(k.data)}
          title={k.title}
          className={`
            inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-white/10 
            bg-white/6 px-3 font-mono text-xs font-semibold text-white/75 
            active:scale-95 active:bg-white/10 active:text-white transition-all
            ${k.tone === 'primary' ? 'border-sky-400/40 bg-sky-400/15 text-sky-100' : ''}
            ${k.tone === 'danger' ? 'border-rose-400/40 bg-rose-400/10 text-rose-200' : ''}
            ${k.className || ''}
          `}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}

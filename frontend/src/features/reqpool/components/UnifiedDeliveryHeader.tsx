import { Plus, Radar, RefreshCw, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Props {
  refreshing: boolean
  onRefresh: () => void
  onQuick: () => void
  onStandard: () => void
  onFeishu: () => void
  onPrioritize: () => void
  prioritizing: boolean
  onVibe: () => void
}

export function UnifiedDeliveryHeader(props: Props) {
  const [entryOpen, setEntryOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const enter = (action: () => void) => { setEntryOpen(false); action() }
  return <header className="flex flex-wrap items-end justify-between gap-4 pb-5">
    <div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Radar size={14} />Forge / Delivery Intelligence</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">AI 交付中心</h1>
      <p className="mt-2 text-xs text-muted-foreground">从需求登记到交付验收，在同一处推进。</p></div>
    <div className="flex flex-wrap items-center gap-3">
      <button className="delivery-action" disabled={props.refreshing} onClick={props.onRefresh}><RefreshCw size={13} className={props.refreshing ? 'animate-spin' : ''} />刷新证据</button>
      <Popover open={moreOpen} onOpenChange={setMoreOpen}><PopoverTrigger asChild><button className="delivery-action">更多<ChevronDown size={13} /></button></PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="end"><button className="w-full px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50" disabled={props.prioritizing} onClick={props.onPrioritize}>{props.prioritizing ? '正在重算…' : '重算需求优先级'}</button>
          <button className="w-full px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { setMoreOpen(false); props.onVibe() }}>AI 调整页面</button></PopoverContent></Popover>
      <Popover open={entryOpen} onOpenChange={setEntryOpen}><PopoverTrigger asChild><button className="delivery-action border-primary/40 text-primary"><Plus size={14} />登记需求<ChevronDown size={13} /></button></PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <Entry title="快速登记" detail="输入描述，保存到需求池" onClick={() => enter(props.onQuick)} />
          <Entry title="标准起草" detail="整理业务字段，进入完整澄清" onClick={() => enter(props.onStandard)} />
          <Entry title="飞书导入" detail="选择飞书需求，核对后起草" onClick={() => enter(props.onFeishu)} />
        </PopoverContent></Popover>
    </div>
  </header>
}

function Entry({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return <button className="w-full rounded-md px-3 py-3 text-left hover:bg-muted" onClick={onClick}><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span></button>
}

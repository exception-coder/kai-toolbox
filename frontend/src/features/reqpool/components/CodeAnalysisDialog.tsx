import { useRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import { formatCompactTime } from './ReqPoolStagePrimitives'

interface Props {
  title: string
  score: number | null
  updatedAt?: number | null
  stale: boolean
  note: string
  effort: DeliveryRequirement['effortProgress']
  deliveryProgress: number | null
  includeTests: boolean
  onIncludeTests: (value: boolean) => void
  change: string
  onChange: (value: string) => void
  busy: boolean
  stage?: string | null
  error?: string | null
  canAnalyze: boolean
  canDevelop: boolean
  developing: boolean
  hasDevSession: boolean
  permissionHint: string
  onAnalyze: () => void
  onDevelop: () => void
  onClose: () => void
  children: ReactNode
}

function range(min: number | null, max: number | null) {
  if (min == null || max == null) return '—'
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
  return min === max ? format(min) : `${format(min)}–${format(max)}`
}

export function CodeAnalysisDialog(props: Props) {
  const container = useFullscreenPortalContainer()
  const returnFocus = useRef(document.activeElement)
  const { effort, score, busy } = props
  const remaining = effort?.remainingWorkdaysMin != null && effort.remainingWorkdaysMax != null
  return <Dialog.Root open onOpenChange={open => { if (!open) props.onClose() }}>
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
      <Dialog.Content onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
        event.preventDefault()
        if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) returnFocus.current.focus()
      }} className="fixed left-1/2 top-1/2 z-[70] flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-lg outline-none">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border)] p-5 sm:px-6">
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold">代码实现分析</Dialog.Title>
            <Dialog.Description className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">{props.title}</Dialog.Description>
          </div>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="关闭代码实现分析"><X className="size-4" /></Button></Dialog.Close>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-6">
            <div><p className="text-xs text-[var(--color-muted-foreground)]">代码实现进度</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{score == null ? <span className="text-xl">尚未分析</span> : <>{score}<span className="ml-1 text-base font-normal">%</span></>}</p>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{props.includeTests ? '包含测试项' : '不含测试项'}</p></div>
            <div><p className="text-xs text-[var(--color-muted-foreground)]">预计剩余工作量</p><p className="mt-2 text-xl font-semibold tabular-nums">{remaining ? <>{range(effort!.remainingWorkdaysMin, effort!.remainingWorkdaysMax)}<span className="ml-1 text-xs font-normal">工作日</span></> : '待评估'}</p>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{remaining ? `约 ${range(effort!.remainingHoursMin, effort!.remainingHoursMax)} 小时 · 按原工时折算` : effort ? '分析后按代码进度折算' : '在“责任与时间”评估工时'}</p></div>
          </div>
          <p className="mt-5 text-sm leading-6">{props.note}</p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{props.updatedAt ? `最近分析 ${formatCompactTime(props.updatedAt)}` : '核对规格、执行计划与本地代码，不修改项目源码。'}</p>
          {props.stale && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">规格或计划已更新，当前结果已过期，请重新分析。</p>}
          {effort?.baselineStale && <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">工时基线已过期：{effort.baselineStaleReasons.join('；')}。请在“责任与时间”重新评估。</p>}
          <div className="mt-6 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {props.children && <details><summary className="cursor-pointer py-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">实现明细与代码证据</summary><div className="pb-5">{props.children}</div></details>}
            {effort && <details><summary className="cursor-pointer py-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">工时估算依据</summary>
              <dl className="space-y-3 pb-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><dt className="text-[var(--color-muted-foreground)]">原评估总工时</dt><dd>{range(effort.baselineHoursMin, effort.baselineHoursMax)} 小时 · {range(effort.baselineWorkdaysMin, effort.baselineWorkdaysMax)} 工作日</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted-foreground)]">折算已完成</dt><dd>{range(effort.completedHoursMin, effort.completedHoursMax)} 小时</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted-foreground)]">综合交付进度</dt><dd>{props.deliveryProgress ?? effort.deliveryProgress}%</dd></div>
              </dl>
              <p className="pb-4 text-xs leading-5 text-[var(--color-muted-foreground)]">按每天 {effort.hoursPerWorkday} 小时折算，基线评估于 {formatCompactTime(effort.estimatedAt)}。规格与计划只计入交付进度，不扣减编码工作量。工时仅供参考。</p>
            </details>}
            <details><summary className="cursor-pointer py-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">分析设置<span className="ml-2 text-xs font-normal text-[var(--color-muted-foreground)]">可选</span></summary>
              <div className="space-y-5 pb-5">
                <label className="block text-sm">关联 OpenSpec 变更
                  <input value={props.change} disabled={busy} onChange={event => props.onChange(event.target.value)} placeholder="例如 optimize-payment-flow" className="mt-2 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] disabled:opacity-50" />
                  <span className="mt-2 block text-xs leading-5 text-[var(--color-muted-foreground)]">填写后以该变更的任务清单为计划依据；留空仅核查源码。</span>
                </label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={props.includeTests} disabled={busy} onChange={event => props.onIncludeTests(event.target.checked)} className="size-4 accent-[var(--color-primary)]" />测试项计入实现进度</label>
                <p className="text-xs text-[var(--color-muted-foreground)]">切换计分口径只重新计算当前结果，不会重新扫描。</p>
              </div>
            </details>
          </div>
          {busy && <div role="status" className="mt-5 text-sm"><p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{props.stage || '正在分析本地代码'}</p><p className="mt-2 text-xs text-[var(--color-muted-foreground)]">可关闭弹框，任务将在后台继续。</p></div>}
          {props.error && <p role="alert" className="mt-5 break-words text-sm text-red-600 dark:text-red-400">{props.error}</p>}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-[var(--color-border)] p-4 sm:px-6">
          {(!props.canAnalyze || props.permissionHint) && <p className="text-xs text-[var(--color-muted-foreground)]">{!props.canAnalyze ? '请先完成执行计划，再核查代码。' : props.permissionHint}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={!props.canDevelop || props.developing || busy} onClick={props.onDevelop}>{props.developing && <Loader2 className="size-4 animate-spin" />}{props.hasDevSession ? '继续开发' : '开始开发'}</Button>
            <Button disabled={busy || !props.canAnalyze} onClick={props.onAnalyze}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? '分析中…' : props.updatedAt ? '重新分析' : '开始分析'}</Button>
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const release = {
  date: '2026.10.18',
  title: '业务咨询升级',
  summary: '直接发问题或截图，Forge 先自主定位，再根据证据回答。',
  changes: [
    { title: '截图直接问', detail: '不必先选系统、模块或填写标题；描述问题、粘贴截图即可开始。' },
    { title: '关联系统自动找', detail: '点击图谱只决定先查哪里。未命中会继续探索关联系统，确实无法判断时再请你补充地址。' },
    { title: '边等边准备', detail: 'AI 回答时仍能输入下一条问题、添加附件；当前回答结束后再发送，草稿会保留。' },
    { title: '附件直接拖入', detail: '截图可粘贴，图片和文件可直接拖入首问或追问输入区。' },
    { title: '定位更有依据', detail: '结合已接入源码核查页面逻辑，查询本地 Git 提交与修改线索，帮助 IT 找到相关开发联系人。' },
  ],
  scope: '可用证据取决于已接入的源码和数据资源；无法确认会说明缺口，业务数据仍只读。',
}

export const CONSULT_UPGRADE_TEXT = [
  `${release.title}｜${release.date}`, release.summary, '',
  ...release.changes.map((change, index) => `${index + 1}. ${change.title}：${change.detail}`),
  '', release.scope,
].join('\n')

/** 公告由用户主动打开，不打断咨询；复制仅写剪贴板，不自动向外发送。 */
export function ConsultUpgradeNotice() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONSULT_UPGRADE_TEXT)
      setCopyState('copied')
    } catch { setCopyState('failed') }
  }
  return <Sheet onOpenChange={() => setCopyState('idle')}>
    <SheetTrigger asChild>
      <button type="button" aria-label="查看升级公告"
        className="pointer-events-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
        <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />升级公告
      </button>
    </SheetTrigger>
    <SheetContent hideCloseButton className="flex h-full w-full max-w-[520px] flex-col bg-background text-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
        <div>
          <p className="mb-2 text-xs tabular-nums text-muted-foreground">{release.date}</p>
          <SheetTitle>{release.title}</SheetTitle>
          <SheetDescription className="mt-2 leading-6">{release.summary}</SheetDescription>
        </div>
        <SheetClose asChild>
          <button type="button" aria-label="关闭升级公告" className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
        </SheetClose>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        <ol className="divide-y divide-border">
          {release.changes.map((change, index) => <li key={change.title} className="flex gap-4 py-4">
            <span className="pt-0.5 text-xs tabular-nums text-muted-foreground" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{change.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{change.detail}</p>
            </div>
          </li>)}
        </ol>
        <p className="border-t border-border py-4 text-xs leading-5 text-muted-foreground">{release.scope}</p>
      </div>
      <div className="border-t border-border px-5 py-4">
        {copyState === 'failed' && <p role="alert" className="mb-2 text-xs text-red-600">复制失败，可重试或选中正文手动复制。</p>}
        <button type="button" onClick={() => void copy()}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {copyState === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span role="status">{copyState === 'copied' ? '已复制，可转发给同事' : '复制公告'}</span>
        </button>
      </div>
    </SheetContent>
  </Sheet>
}

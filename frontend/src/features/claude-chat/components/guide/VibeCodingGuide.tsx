import { useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, BookOpen, MapPin, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { GUIDE_CHAPTERS, type GuideTarget } from './guideContent'

const SEEN_KEY = 'kai-toolbox:vibe-guide:v1:seen'
const control = 'min-h-11 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'

function alreadySeen() {
  try { return localStorage.getItem(SEEN_KEY) === 'true' } catch { return false }
}

export function VibeCodingGuide({ open, onOpenChange, onLocate, hasSession, returnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onLocate: (target: GuideTarget) => void
  hasSession: boolean; returnFocus: RefObject<HTMLButtonElement | null>
}) {
  const [seen, setSeen] = useState(alreadySeen)
  const [storageError, setStorageError] = useState(false)
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'tour' | 'reference'>('tour')
  const [search, setSearch] = useState('')
  const portal = useFullscreenPortalContainer()
  const markSeen = () => {
    setSeen(true)
    try { localStorage.setItem(SEEN_KEY, 'true'); setStorageError(false) } catch { setStorageError(true) }
  }
  const close = () => { markSeen(); onOpenChange(false) }
  const chapter = GUIDE_CHAPTERS[step]
  return <>
    {!seen && !open && <aside data-focus-chrome aria-label="Vibe Coding 入门提示" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs">
      <BookOpen className="size-4 text-[var(--color-muted-foreground)]" />
      <span className="min-w-0 flex-1">功能很多？先了解从新建会话到交付的工作路径。</span>
      <button className={control} onClick={() => { setMode('tour'); setStep(0); onOpenChange(true) }}>开始导览</button>
      <button className={control} onClick={markSeen}>暂时跳过</button>
    </aside>}
    {storageError && !open && <p role="status" className="px-4 py-1 text-xs text-[var(--color-muted-foreground)]">浏览器未允许记住导览偏好；本次已关闭，刷新后可能再次提示。</p>}
    <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); else onOpenChange(true) }}><Dialog.Portal container={portal}>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/35" />
      <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus() }}
        className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90dvh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] shadow-lg">
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--color-border)] p-4 sm:px-6">
          <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold">Vibe Coding 功能导览</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">了解用途与入口。只查看和定位，不替你启动任务或执行写操作。</Dialog.Description></div>
          <Dialog.Close aria-label="关闭导览" className={`${control} shrink-0`}><X className="size-4" /></Dialog.Close>
        </header>
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--color-border)] px-4 py-2 sm:px-6" aria-label="导览阅读方式">
          <button aria-pressed={mode === 'tour'} className={`${control} ${mode === 'tour' ? 'bg-[var(--color-muted)] font-medium' : ''}`} onClick={() => setMode('tour')}>简短导览</button>
          <button aria-pressed={mode === 'reference'} className={`${control} ${mode === 'reference' ? 'bg-[var(--color-muted)] font-medium' : ''}`} onClick={() => setMode('reference')}>完整功能指南</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
          {mode === 'reference' ? <GuideReference search={search} onSearch={setSearch} onChoose={index => { setStep(index); setSearch(''); setMode('tour') }} /> : <>
            <p className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{step + 1} / {GUIDE_CHAPTERS.length}</p>
            <h2 className="mt-2 text-xl font-semibold">{chapter.title}</h2><p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">{chapter.summary}</p>
            <div className="mt-5 border-l-2 border-[var(--color-primary)] pl-3"><p className="text-xs text-[var(--color-muted-foreground)]">先掌握这一条</p><h3 className="mt-1 text-sm font-semibold">{chapter.topics[0].title}</h3>
              <p className="mt-1 text-sm leading-relaxed">{chapter.topics[0].purpose}</p><p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">什么时候用：{chapter.topics[0].when}</p><p className="mt-1 text-xs leading-relaxed">入口：{chapter.topics[0].path}</p></div>
            <details key={chapter.id} className="mt-4 border-t border-[var(--color-border)] pt-3"><summary className="min-h-11 cursor-pointer text-sm">这一类还能做什么</summary>
              <div className="divide-y divide-[var(--color-border)]">{chapter.topics.slice(1).map(topic => <section key={topic.title} className="py-3"><h3 className="text-sm font-medium">{topic.title}</h3><p className="mt-1 text-xs leading-relaxed">{topic.purpose}</p><p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">什么时候用：{topic.when}</p><p className="mt-1 text-xs leading-relaxed">入口：{topic.path}</p></section>)}</div>
            </details>
            {!hasSession && <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted-foreground)]">你尚未选择会话。轨迹、用量、规格与交付操作需要先新建或选择会话；能力以当前引擎和权限为准。</p>}
          </>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] p-3 sm:px-6">
          <button className={control} onClick={close}>{mode === 'tour' ? '跳过导览' : '关闭指南'}</button>
          {mode === 'tour' && <div className="flex flex-wrap items-center gap-1">
            <button className={`${control} flex items-center gap-1 disabled:opacity-40`} disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="size-3.5" />上一步</button>
            <button disabled={!hasSession && chapter.id === 'execution'} className={`${control} flex items-center gap-1 disabled:opacity-40`} onClick={() => { markSeen(); onOpenChange(false); onLocate(chapter.id) }}><MapPin className="size-3.5" />定位入口</button>
            <button className={`${control} flex items-center gap-1 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]`} onClick={() => step === GUIDE_CHAPTERS.length - 1 ? close() : setStep(step + 1)}>{step === GUIDE_CHAPTERS.length - 1 ? '完成' : '下一步'}<ArrowRight className="size-3.5" /></button>
          </div>}
        </footer>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>
}

function GuideReference({ search, onSearch, onChoose }: { search: string; onSearch: (value: string) => void; onChoose: (index: number) => void }) {
  const needle = search.trim().toLocaleLowerCase()
  const chapters = GUIDE_CHAPTERS.map((chapter, index) => ({ ...chapter, index, topics: chapter.topics.filter(topic => !needle || `${chapter.title} ${topic.title} ${topic.purpose} ${topic.when} ${topic.path}`.toLocaleLowerCase().includes(needle)) })).filter(chapter => chapter.topics.length)
  return <><label className="block text-xs font-medium" htmlFor="vibe-guide-search">查找功能或入口</label><input id="vibe-guide-search" value={search} onChange={event => onSearch(event.target.value)} placeholder="例如：附加项目、导出、用量" className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm" />
    {!chapters.length && <p role="status" className="py-6 text-sm">没有匹配功能。试试“会话”“项目”或清空搜索。</p>}
    {chapters.map(chapter => <section key={chapter.id} className="mt-5 border-t border-[var(--color-border)] pt-4"><button className={`${control} -ml-3 font-semibold`} onClick={() => onChoose(chapter.index)}>{chapter.title} →</button><p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">{chapter.summary}</p>
      <dl className="mt-3 space-y-4">{chapter.topics.map(topic => <div key={topic.title}><dt className="text-sm font-medium">{topic.title}</dt><dd className="mt-1 text-xs leading-relaxed">{topic.purpose}</dd><dd className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">什么时候用：{topic.when}</dd><dd className="mt-1 text-xs leading-relaxed">入口：{topic.path}</dd></div>)}</dl></section>)}
  </>
}

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { loadCommunicationImage } from '../../api/communicationJournal'

/** 图片采用带鉴权读取及短生命周期 blob URL，不暴露文件读取入口。 */
export function JournalImage({ sessionId, recordId, imageId, name }: {
  sessionId: string; recordId: string; imageId: string; name: string
}) {
  const portal = useFullscreenPortalContainer()
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let live = true, objectUrl = ''
    const abort = new AbortController()
    setUrl(''); setError('')
    loadCommunicationImage(sessionId, recordId, imageId, abort.signal).then(blob => {
      if (!live) return
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : '图片读取失败') })
    return () => { live = false; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [sessionId, recordId, imageId, retry])
  if (error) return <div className="border p-3 text-xs"><p>{name} · {error}</p>
    <button type="button" className="mt-2 min-h-11 px-3 underline" onClick={() => setRetry(value => value + 1)}>重试图片</button></div>
  if (!url) return <p role="status" className="border p-4 text-xs">正在读取 {name}…</p>
  return <Dialog.Root open={expanded} onOpenChange={setExpanded}>
    <Dialog.Trigger asChild><button type="button" className="min-w-0 overflow-hidden rounded-md border text-left focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label={`放大截图 ${name}`}>
      <img src={url} alt={name} loading="lazy" className="h-40 w-full object-contain bg-[var(--color-muted)]" />
      <span className="block truncate px-3 py-2 text-xs">{name}</span>
    </button></Dialog.Trigger>
    <Dialog.Portal container={portal}><Dialog.Overlay className="fixed inset-0 z-[85] bg-black/60" />
      <Dialog.Content className="fixed inset-4 z-[86] flex flex-col rounded-lg border bg-[var(--color-background)] p-4 sm:inset-8">
        <div className="flex items-center justify-between gap-3"><Dialog.Title className="truncate text-sm font-medium">{name}</Dialog.Title>
          <Dialog.Close aria-label="关闭截图" className="min-h-11 min-w-11"><X className="mx-auto size-4" /></Dialog.Close></div>
        <Dialog.Description className="sr-only">原始沟通截图，可滚动查看完整内容。</Dialog.Description>
        <div className="min-h-0 flex-1 overflow-auto"><img src={url} alt={name} className="mx-auto max-w-full" /></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

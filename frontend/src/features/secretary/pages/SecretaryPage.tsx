import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Entry, InputMethod } from '../types'
import { addEntry, listEntries, removeEntry } from '../lib/entryRepo'
import { createEntry } from '../lib/createEntry'
import { ComposerTabs } from '../components/ComposerTabs'
import { TextComposer } from '../components/TextComposer'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Timeline } from '../components/Timeline'
import { EntryDetail } from '../components/EntryDetail'

export function SecretaryPage() {
  const confirm = useConfirm()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [composer, setComposer] = useState<InputMethod>('text')
  // 移动端可折叠 composer，腾给时间轴更多空间
  const [composerOpen, setComposerOpen] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    listEntries()
      .then(list => {
        if (!cancelled) setEntries(list)
      })
      .catch(err => {
        if (!cancelled) setBanner({ kind: 'error', text: `加载历史记录失败：${(err as Error).message}` })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 自动隐藏 banner
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 2500)
    return () => clearTimeout(t)
  }, [banner])

  const showOk = useCallback((text: string) => setBanner({ kind: 'success', text }), [])
  const showErr = useCallback((text: string) => setBanner({ kind: 'error', text }), [])

  async function handleSubmitText(text: string) {
    try {
      const { entry } = await createEntry({ kind: 'text', text })
      await addEntry(entry)
      setEntries(prev => [entry, ...prev])
      showOk('已记下')
    } catch (err) {
      showErr(`保存失败：${(err as Error).message}`)
    }
  }

  async function handleSubmitVoice(blob: Blob, durationMs: number, mimeType: string) {
    try {
      const { entry, blob: b } = await createEntry({ kind: 'voice', blob, durationMs, mimeType })
      await addEntry(entry, b)
      setEntries(prev => [entry, ...prev])
      showOk('语音已保存')
    } catch (err) {
      showErr(`保存失败：${(err as Error).message}`)
    }
  }

  async function handleSubmitFiles(files: File[]) {
    let saved = 0
    for (const f of files) {
      try {
        const { entry, blob } = await createEntry({ kind: 'file', file: f })
        await addEntry(entry, blob)
        setEntries(prev => [entry, ...prev])
        saved++
      } catch (err) {
        showErr(`「${f.name}」入库失败：${(err as Error).message}`)
      }
    }
    if (saved > 0) showOk(`已入库 ${saved} 个附件`)
  }

  async function handleRemove(id: string) {
    const ok = await confirm({
      title: '删除这条记录？',
      description: '删除后无法恢复。',
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await removeEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      if (detailId === id) setDetailId(null)
      showOk('已删除')
    } catch (err) {
      showErr(`删除失败：${(err as Error).message}`)
    }
  }

  const activeEntry = detailId ? entries.find(e => e.id === detailId) ?? null : null

  return (
    <div className="flex h-full flex-col">
      {/* 顶部 Composer 区：移动端可折叠 */}
      <div className="sticky top-0 z-20 border-b bg-[var(--color-background)]/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 pb-3 pt-3 sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <ComposerTabs value={composer} onChange={setComposer} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setComposerOpen(o => !o)}
              aria-label={composerOpen ? '折叠录入区' : '展开录入区'}
            >
              {composerOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
          <div
            className={cn(
              'overflow-hidden transition-[max-height,opacity] duration-200',
              composerOpen ? 'max-h-[480px] opacity-100' : 'max-h-0 opacity-0',
            )}
          >
            {composer === 'text' && <TextComposer onSubmit={handleSubmitText} />}
            {composer === 'voice' && <VoiceRecorder onSubmit={handleSubmitVoice} />}
            {composer === 'file' && <AttachmentPicker onSubmitFiles={handleSubmitFiles} />}
          </div>
          {banner && (
            <div
              role="status"
              className={cn(
                'mt-2 rounded-md px-3 py-1.5 text-xs',
                banner.kind === 'success'
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
              )}
            >
              {banner.text}
            </div>
          )}
        </div>
      </div>

      {/* 时间轴 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-3 py-4 sm:px-4">
          <Timeline
            entries={entries}
            loading={loading}
            onOpen={setDetailId}
            onRemove={handleRemove}
          />
        </div>
      </div>

      <EntryDetail entry={activeEntry} onClose={() => setDetailId(null)} />
    </div>
  )
}

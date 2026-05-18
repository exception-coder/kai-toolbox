import { useEffect, useState } from 'react'
import { Download, MapPin } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils'
import type { Entry } from '../types'
import { getBlob } from '../lib/entryRepo'
import { formatDurationShort } from '../lib/format'
import { formatGeoShort } from '../lib/geo'

interface Props {
  entry: Entry | null
  onClose: () => void
}

export function EntryDetail({ entry, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [blobMeta, setBlobMeta] = useState<{ type: string; size: number } | null>(null)

  // 详情打开时按需拉 blob 并 createObjectURL；关闭 / 切换时撤销，避免内存泄漏
  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    if (!entry || entry.inputMethod === 'text') {
      setBlobUrl(null)
      setBlobMeta(null)
      return
    }
    setLoading(true)
    getBlob(entry.id)
      .then(blob => {
        if (cancelled) return
        if (!blob) {
          setBlobUrl(null)
          setBlobMeta(null)
          return
        }
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
        setBlobMeta({ type: blob.type || 'application/octet-stream', size: blob.size })
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(null)
          setBlobMeta(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [entry])

  const open = entry !== null
  const title = entry ? titleOf(entry) : ''

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full !max-w-full flex-col gap-4 p-5 sm:!max-w-md"
      >
        <div className="space-y-1">
          <SheetTitle>{title}</SheetTitle>
          {entry && (
            <SheetDescription>
              {new Date(entry.createdAt).toLocaleString()}
            </SheetDescription>
          )}
        </div>

        {entry && (
          <div className="flex-1 space-y-4 overflow-y-auto">
            {entry.inputMethod === 'text' && (
              <p className="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
            )}

            {entry.inputMethod === 'voice' && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  时长 <span className="font-mono">{formatDurationShort(entry.durationMs)}</span>
                </p>
                {loading ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">载入音频中…</p>
                ) : blobUrl ? (
                  <audio
                    controls
                    src={blobUrl}
                    className="w-full"
                  />
                ) : (
                  <p className="text-xs text-[var(--color-destructive)]">音频已丢失</p>
                )}
              </div>
            )}

            {entry.inputMethod === 'file' && (
              <div className="space-y-3">
                <div className="rounded-md border bg-[var(--color-muted)]/40 p-3 text-sm">
                  <div className="font-medium">{entry.fileName}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {entry.mimeType || '未知类型'} · {formatBytes(entry.fileSize)}
                  </div>
                </div>
                {loading ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">载入附件中…</p>
                ) : blobUrl ? (
                  <div className="space-y-3">
                    {isImage(entry.mimeType, blobMeta?.type) && (
                      <img
                        src={blobUrl}
                        alt={entry.fileName}
                        className="max-h-72 w-full rounded-md border object-contain"
                      />
                    )}
                    <Button asChild size="sm" variant="outline">
                      <a href={blobUrl} download={entry.fileName}>
                        <Download className="size-3.5" />
                        下载
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-destructive)]">附件已丢失</p>
                )}
              </div>
            )}

            {entry.geo && (
              <div className="flex items-start gap-2 rounded-md border bg-[var(--color-muted)]/40 p-3 text-xs">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                <div className="space-y-0.5">
                  <div>{formatGeoShort(entry.geo)}</div>
                  <div className="text-[var(--color-muted-foreground)]">
                    采集于 {new Date(entry.geo.capturedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function titleOf(entry: Entry): string {
  switch (entry.inputMethod) {
    case 'text':
      return '文字消息'
    case 'voice':
      return '语音记录'
    case 'file':
      return entry.fileName
  }
}

function isImage(declared: string, actual?: string): boolean {
  const m = (declared || actual || '').toLowerCase()
  return m.startsWith('image/')
}

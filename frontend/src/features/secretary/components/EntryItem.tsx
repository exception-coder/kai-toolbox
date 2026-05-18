import { MapPin, MessageSquare, Mic, Paperclip, Trash2 } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import type { Entry } from '../types'
import { formatDurationShort, formatHM } from '../lib/format'
import { formatGeoShort } from '../lib/geo'

interface Props {
  entry: Entry
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

const ICON_MAP = {
  text: MessageSquare,
  voice: Mic,
  file: Paperclip,
} as const

export function EntryItem({ entry, onOpen, onRemove }: Props) {
  const Icon = ICON_MAP[entry.inputMethod]
  return (
    <div
      className={cn(
        'group flex gap-3 rounded-lg border bg-[var(--color-card)] p-3 transition-colors',
        'hover:border-[var(--color-ring)]/40 hover:bg-[var(--color-accent)]/30',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span className="font-mono tabular-nums">{formatHM(entry.createdAt)}</span>
            <span>·</span>
            <span>{labelOf(entry.inputMethod)}</span>
          </div>
          <div className="min-w-0 text-sm">{renderPreview(entry)}</div>
          {entry.geo && (
            <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
              <MapPin className="size-3" />
              <span>{formatGeoShort(entry.geo)}</span>
            </div>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="self-start rounded p-1.5 text-[var(--color-muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)] group-hover:opacity-100"
        aria-label="删除"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function labelOf(m: Entry['inputMethod']): string {
  switch (m) {
    case 'text':
      return '文字'
    case 'voice':
      return '语音'
    case 'file':
      return '附件'
  }
}

function renderPreview(entry: Entry) {
  switch (entry.inputMethod) {
    case 'text': {
      const text = entry.text.length > 200 ? `${entry.text.slice(0, 200)}…` : entry.text
      return <p className="whitespace-pre-wrap break-words">{text}</p>
    }
    case 'voice':
      return (
        <p className="text-[var(--color-muted-foreground)]">
          语音 · 时长 <span className="font-mono">{formatDurationShort(entry.durationMs)}</span>
        </p>
      )
    case 'file':
      return (
        <p className="text-[var(--color-muted-foreground)]">
          <span className="text-[var(--color-foreground)]">{entry.fileName}</span>
          <span className="ml-2 text-xs">{formatBytes(entry.fileSize)}</span>
        </p>
      )
  }
}

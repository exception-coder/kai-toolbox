import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, Film, Loader2, Music, Image as ImageIcon, Link2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { parseUrl } from '../api'
import type { MediaItemView, ParseResultView } from '../types'

// ── 常量映射 ──────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: 'TikTok',
  DOUYIN: '抖音',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter / X',
  REDDIT: 'Reddit',
  PINTEREST: 'Pinterest',
  FACEBOOK: 'Facebook',
  BILIBILI: 'Bilibili',
  XIAOHONGSHU: '小红书',
}

const QUALITY_LABELS: Record<string, string> = {
  'no-watermark': '无水印',
  watermark: '有水印',
  audio: '纯音频',
  best: '最高质量',
}

const SUPPORTED_PLATFORMS = ['TikTok', '抖音', 'Instagram', 'YouTube', 'Twitter/X', 'Reddit', 'Pinterest', 'Facebook', 'Bilibili', '小红书']

// ── 子组件 ────────────────────────────────────────────────────────────────────

function ItemIcon({ type }: { type: MediaItemView['type'] }) {
  if (type === 'IMAGE') return <ImageIcon className="h-5 w-5 shrink-0" />
  if (type === 'AUDIO') return <Music className="h-5 w-5 shrink-0" />
  return <Film className="h-5 w-5 shrink-0" />
}

function DownloadItem({ item }: { item: MediaItemView }) {
  const typeLabel = { VIDEO: '视频', IMAGE: '图片', AUDIO: '音频' }[item.type] ?? item.type
  const qualityLabel = item.quality ? (QUALITY_LABELS[item.quality] ?? item.quality) : null
  const filename = item.type === 'AUDIO' ? 'audio.m4a' : 'video.mp4'

  return (
    <a
      href={item.url}
      download={filename}
      className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 active:bg-muted"
    >
      <div className="flex items-center gap-3 text-foreground">
        <ItemIcon type={item.type} />
        <div>
          <p className="text-sm font-medium leading-tight">{typeLabel}</p>
          {qualityLabel && (
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{qualityLabel}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--color-primary)]">
        <Download className="h-4 w-4" />
        下载
      </div>
    </a>
  )
}

function VideoPreview({ src }: { src: string }) {
  const [show, setShow] = useState(false)
  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium text-[var(--color-primary)] active:bg-muted"
      >
        <Play className="h-4 w-4" />
        预览视频
      </button>
    )
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={src}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className="w-full rounded-xl bg-black"
      style={{ maxHeight: 360 }}
    />
  )
}

function ResultCard({ result }: { result: ParseResultView }) {
  const [thumbError, setThumbError] = useState(false)
  const platformLabel = PLATFORM_LABELS[result.platform] ?? result.platform

  // 找首个视频条目，把下载链接转成 inline 形式给 <video> 用
  const videoItem = result.items.find((i) => i.type === 'VIDEO')
  const previewSrc = videoItem
    ? videoItem.url + (videoItem.url.includes('?') ? '&' : '?') + 'inline=true'
    : null

  return (
    <div className="flex flex-col gap-3">
      {/* 封面 */}
      {result.thumbnail && !thumbError && (
        <img
          src={result.thumbnail}
          alt="封面"
          className="w-full rounded-xl object-cover"
          style={{ maxHeight: 280 }}
          onError={() => setThumbError(true)}
        />
      )}

      {/* 元信息 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{platformLabel}</Badge>
        {result.title && (
          <span className="line-clamp-2 text-sm font-medium">{result.title}</span>
        )}
      </div>
      {result.author && (
        <p className="text-xs text-[var(--color-muted-foreground)]">by {result.author}</p>
      )}

      {/* 视频预览（点击展开，避免移动端自动加载流量浪费） */}
      {previewSrc && <VideoPreview src={previewSrc} />}

      {/* 下载列表 */}
      <div className="flex flex-col gap-2">
        {result.items.map((item, i) => (
          <DownloadItem key={i} item={item} />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Link2 className="h-7 w-7 text-[var(--color-muted-foreground)]" />
      </div>
      <div>
        <p className="font-medium">粘贴分享链接开始解析</p>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          支持 {SUPPORTED_PLATFORMS.join(' · ')}
        </p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
      <p className="text-sm text-[var(--color-muted-foreground)]">解析中，请稍候…</p>
    </div>
  )
}

// ── URL 提取 ──────────────────────────────────────────────────────────────────

/** 从分享文案里抽出第一个 http(s) 链接，去掉常见尾部标点。 */
function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i)
  if (!match) return null
  return match[0].replace(/[.,;:。，；：、)]+$/, '')
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export function MediaParserPage() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResultView | null>(null)

  const mutation = useMutation({
    mutationFn: parseUrl,
    onSuccess: (data) => {
      setResult(data)
      setError(null)
    },
    onError: (e) => {
      setResult(null)
      setError(e instanceof ApiError ? e.message : String(e))
    },
  })

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    // 粘贴混合文案（如抖音/小红书分享文本）时，只保留 http(s) 链接部分
    const extracted = extractFirstUrl(value)
    setUrl(extracted && extracted !== value.trim() ? extracted : value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = (extractFirstUrl(url) ?? url).trim()
    if (!trimmed) return
    if (trimmed !== url) setUrl(trimmed)
    mutation.mutate(trimmed)
  }

  const hasContent = result || error || mutation.isPending

  return (
    <div className="flex h-full flex-col">
      {/* 顶部固定输入栏 */}
      <div className="shrink-0 border-b bg-background px-4 pb-3 pt-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            placeholder="粘贴分享链接或整段分享文案…"
            value={url}
            onChange={handleUrlChange}
            disabled={mutation.isPending}
            className="h-11 flex-1 text-base"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            disabled={!url.trim() || mutation.isPending}
            className="h-11 shrink-0 px-5 text-base"
          >
            解析
          </Button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUPPORTED_PLATFORMS.map((p) => (
            <span
              key={p}
              className="rounded-full border px-2.5 py-0.5 text-xs text-[var(--color-muted-foreground)]"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasContent && <EmptyState />}
        {mutation.isPending && <LoadingState />}
        {error && !mutation.isPending && (
          <div className="rounded-xl border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
            {error}
          </div>
        )}
        {result && !mutation.isPending && <ResultCard result={result} />}
      </div>
    </div>
  )
}

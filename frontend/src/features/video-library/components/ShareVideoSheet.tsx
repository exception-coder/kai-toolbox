import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, Check, Copy, FileVideo, Link2, Loader2, Send, Share2 } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import { createVideoShare, revokeVideoShare, videoShareUrl, type VideoShareRecord } from '../api'
import { detectShareCapability, ShareCancelledError, shareVideoFile } from '../lib/share'
import type { VideoLibraryItem } from '../types'

interface Props {
  item: VideoLibraryItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 分享面板。两条路并列摆出来，各自说明适用场景与限制：
 *
 * - **发送文件**：走系统分享面板，微信/QQ 收到的是视频文件本体，对方随时能看。
 *   受浏览器能力与内存限制（见 lib/share.ts）。
 * - **公开链接**：签发单视频、可撤销的分享凭证，对方点开即播，不受大小限制；
 *   但需要工作台此刻是从公网地址访问的（否则生成的是内网地址，只有同一网络能打开）。
 *
 * 关键 UX 决定：**不可用的选项不藏起来、也不只靠 title 提示**。之前用 disabled + title
 * 说明原因，在手机上没有 hover，用户只看到一个灰按钮不知道为什么 —— 原因必须是可见文本。
 */
export function ShareVideoSheet({ item, open, onOpenChange }: Props) {
  const [fileBusy, setFileBusy] = useState(false)
  const [fileLoaded, setFileLoaded] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)

  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [share, setShare] = useState<VideoShareRecord | null>(null)
  const [copied, setCopied] = useState(false)

  const capability = useMemo(() => detectShareCapability(item.size), [item.size])

  // 换视频就把上一部的分享结果丢掉，免得把 A 的链接当成 B 的发出去。
  useEffect(() => {
    setShare(null)
    setLinkError(null)
    setFileError(null)
  }, [item.path])

  const percent = item.size > 0 ? Math.min(100, Math.round((fileLoaded / item.size) * 100)) : 0
  const shareUrl = share ? videoShareUrl(share.token) : null
  // 本地/内网地址生成的链接发到微信也打不开，提前说清楚而不是让用户发出去才发现
  const isPublicOrigin = useMemo(() => {
    const h = window.location.hostname
    return !(h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.local'))
  }, [])

  const handleShareFile = async () => {
    if (fileBusy || !capability.available) return
    setFileBusy(true)
    setFileError(null)
    setFileLoaded(0)
    try {
      await shareVideoFile(item, { onProgress: setFileLoaded })
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ShareCancelledError) return
      setFileError(e instanceof Error ? e.message : String(e))
    } finally {
      setFileBusy(false)
      setFileLoaded(0)
    }
  }

  const handleCreateLink = async () => {
    if (linkBusy) return
    setLinkBusy(true)
    setLinkError(null)
    try {
      setShare(await createVideoShare(item))
    } catch (e) {
      setLinkError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLinkBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setLinkError('复制失败，请长按上方地址手动复制')
    }
  }

  /** 分享的是一段文字+链接。链接分享的浏览器支持面远比文件分享广，微信/QQ 都在面板里。 */
  const handleShareLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.share({ title: item.name, text: item.name, url: shareUrl })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setLinkError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRevoke = async () => {
    if (!share) return
    try {
      await revokeVideoShare(share.token)
      setShare(null)
    } catch (e) {
      setLinkError(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col overflow-y-auto p-4">
        <SheetTitle className="text-base">分享视频</SheetTitle>
        <SheetDescription className="break-all text-xs">
          {item.name} · {formatBytes(item.size)}
        </SheetDescription>

        <div className="mt-4 space-y-3">
          {/* ── 发送文件 ─────────────────────────────────────────── */}
          <section className="rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <FileVideo className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">发送文件到微信 / QQ</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  对方收到的是视频文件本体，存下来随时能看，不依赖你的电脑开着。
                </div>
              </div>
            </div>

            {capability.available ? (
              <button
                type="button"
                onClick={handleShareFile}
                disabled={fileBusy}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-60"
              >
                {fileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {fileBusy ? `读取中 ${percent}%` : '选择应用发送'}
              </button>
            ) : (
              // 不可用时给出可见原因 + 指路，而不是一个沉默的灰按钮
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div>{capability.reason}</div>
                  <div className="mt-1 opacity-80">可改用下面的「公开链接」，不受文件大小限制。</div>
                </div>
              </div>
            )}
            {fileError && <div className="mt-2 text-xs text-[var(--color-destructive)]">{fileError}</div>}
          </section>

          {/* ── 公开链接 ─────────────────────────────────────────── */}
          <section className="rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">生成公开链接</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  单个视频的只读链接，默认 7 天有效、可随时撤销，不含你的登录态。
                  对方点开即播，需要你的电脑与隧道保持在线。
                </div>
              </div>
            </div>

            {!isPublicOrigin && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  当前是从内网地址（{window.location.hostname}）访问工作台，生成的链接只有同一网络能打开。
                  要发给微信好友，请先从公网地址（如 cloudflare 隧道域名）打开工作台再生成。
                </div>
              </div>
            )}

            {!share ? (
              <button
                type="button"
                onClick={handleCreateLink}
                disabled={linkBusy}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border text-sm font-medium hover:bg-[var(--color-accent)] disabled:opacity-60"
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                生成链接
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="break-all rounded-md border bg-[var(--color-muted)]/30 p-2 font-mono text-[11px]">
                  {shareUrl}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs hover:bg-[var(--color-accent)]"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? '已复制' : '复制链接'}
                  </button>
                  {typeof navigator.share === 'function' && (
                    <button
                      type="button"
                      onClick={handleShareLink}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] text-xs font-medium text-[var(--color-primary-foreground)]"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      发送链接
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-center rounded-md border bg-white p-3">
                  <QRCodeSVG value={shareUrl ?? ''} size={160} level="M" marginSize={1} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--color-muted-foreground)]">
                  <span>有效期至 {new Date(share.expiresAt).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={handleRevoke}
                    className="rounded px-2 py-1 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                  >
                    立即失效
                  </button>
                </div>
              </div>
            )}
            {linkError && <div className="mt-2 text-xs text-[var(--color-destructive)]">{linkError}</div>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** 供外部复用的样式片段：让触发按钮与面板保持同一套视觉语言。 */
export const shareTriggerClass = cn(
  'shrink-0 rounded-md border px-2 py-1.5 text-xs transition-colors',
  'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
)

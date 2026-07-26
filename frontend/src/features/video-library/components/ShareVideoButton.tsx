import { useMemo, useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { detectShareCapability, ShareCancelledError, shareVideoFile } from '../lib/share'
import type { VideoLibraryItem } from '../types'

interface Props {
  item: VideoLibraryItem
  className?: string
}

/**
 * 「分享」按钮：把视频文件本身交给系统分享面板（微信 / QQ 都在面板里）。
 *
 * 分享的是**文件**不是链接 —— 链接指向的是内网地址 + 30 分钟就过期的 token，
 * 微信好友点开必然打不开；发文件对方才真能收到并播放。
 *
 * 不可用时按钮不消失，而是禁用 + title 说明原因（桌面浏览器不支持分享文件、
 * 非 https 环境没有该 API、文件超过内存上限）——按钮凭空消失比禁用更让人困惑。
 */
export function ShareVideoButton({ item, className }: Props) {
  const confirm = useConfirm()
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(0)

  // 能力探测依赖当前文件大小，换片要重算。
  const capability = useMemo(() => detectShareCapability(item.size), [item.size])

  const percent = item.size > 0 ? Math.min(100, Math.round((loaded / item.size) * 100)) : 0

  const handleShare = async () => {
    if (pending || !capability.available) return
    setPending(true)
    setLoaded(0)
    try {
      await shareVideoFile(item, { onProgress: setLoaded })
    } catch (e) {
      // 用户自己点的取消，不该弹错误框打扰他
      if (e instanceof ShareCancelledError) return
      await confirm({
        title: '分享失败',
        description: (
          <div className="space-y-1 text-sm">
            <div>{e instanceof Error ? e.message : String(e)}</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              视频需要先完整读入内存才能交给系统分享面板，大文件或内存紧张时容易失败。
            </div>
          </div>
        ),
        confirmText: '知道了',
        cancelText: '关闭',
      })
    } finally {
      setPending(false)
      setLoaded(0)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={!capability.available || pending}
      title={capability.reason ?? `分享《${item.name}》（${formatBytes(item.size)}）到微信 / QQ 等`}
      className={cn(
        'shrink-0 rounded-md border px-2 py-1.5 text-xs transition-colors',
        'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        className,
      )}
    >
      {pending ? (
        <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
      ) : (
        <Share2 className="inline h-3.5 w-3.5" />
      )}
      {/* 读取阶段把百分比顶上来，替代无反馈的转圈 */}
      <span className="ml-1 tabular-nums">{pending ? `${percent}%` : '分享'}</span>
    </button>
  )
}

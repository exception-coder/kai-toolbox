import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ShareVideoSheet, shareTriggerClass } from './ShareVideoSheet'
import type { VideoLibraryItem } from '../types'

interface Props {
  item: VideoLibraryItem
  className?: string
}

/**
 * 「分享」入口。
 *
 * 按钮本身**永远可点** —— 能不能发文件、为什么不能，全部在面板里以可见文本说明。
 * 之前的做法是按能力探测直接把按钮 disabled + title 写原因，但手机上没有 hover，
 * 用户只看到一个点不动的灰按钮，等于什么都没告诉他。
 */
export function ShareVideoButton({ item, className }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="分享"
        className={className ? `${shareTriggerClass} ${className}` : shareTriggerClass}
      >
        <Share2 className="inline h-3.5 w-3.5" />
        <span className="ml-1">分享</span>
      </button>
      {/* 面板挂载在按钮旁边，key 绑 path：换视频时内部状态（已生成的链接等）整体重置 */}
      <ShareVideoSheet key={item.path} item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}

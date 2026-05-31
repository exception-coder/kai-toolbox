import { useState } from 'react'
import { Clock, Grid3X3, Languages, Loader2, RefreshCw, Tags } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { durationProbeApi, languageDetectApi, nameGroupingApi, syncVideoLibrary, thumbnailGridApi } from '../api'
import { ProcessingJobButton } from './ProcessingJobButton'

/**
 * 视频处理工具栏：单独一行放在 VideoListPanel 顶栏，承载本期 5 类操作：
 *
 * - **同步视频库**（阻塞）：把 treesize_node 里的视频 INSERT OR IGNORE 到 treesize_video
 * - **探测时长**（任务）：ffprobe 拿 duration_s + 算 duration_bucket
 * - **按名称归类**（任务）：正则去噪算系列签名 + 集数
 * - **识别语言**（任务）：whisper-cli `--detect-language` 抽 60s 音频判 ISO 码
 * - **生成九宫格**（任务）：ffmpeg 单条命令 tile=3x3 出 contact sheet
 *
 * 后续 3 类（人物年龄 / 视觉嵌入 / 聚类）落地时在本组件追加按钮，VideoListPanel 不动。
 */
export function VideoProcessingToolbar() {
  const confirm = useConfirm()
  const [, setBumpKey] = useState(0)

  const syncMutation = useMutation({
    mutationFn: syncVideoLibrary,
    onSuccess: async (r) => {
      await confirm({
        title: '同步完成',
        description: (
          <div className="space-y-1 text-sm">
            <div>扫描视频 <strong className="tabular-nums">{r.scannedFromNode}</strong> 个</div>
            <div>
              新增{' '}
              <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {r.insertedNew}
              </strong>{' '}
              条 · 已存在跳过 <span className="tabular-nums">{r.skippedExisting}</span>
            </div>
            {r.skippedTooSmall > 0 && (
              <div className="text-xs text-[var(--color-muted-foreground)]">
                （另过滤掉 {r.skippedTooSmall} 个 &lt; 30KB 的噪音文件）
              </div>
            )}
            <div className="text-xs text-[var(--color-muted-foreground)]">
              耗时 {r.elapsedMs} ms
            </div>
          </div>
        ),
        confirmText: '知道了',
        cancelText: '关闭',
      })
      // 同步后视频表多了新行，触发 ProcessingJobButton 重拉 status 把 total 刷新
      setBumpKey(k => k + 1)
    },
    onError: async (e) => {
      const msg = e instanceof ApiError ? e.message : String(e)
      await confirm({
        title: '同步失败',
        description: msg,
        confirmText: '知道了',
        cancelText: '关闭',
      })
    },
  })

  const handleStartError = async (message: string) => {
    await confirm({
      title: '启动任务失败',
      description: message,
      confirmText: '知道了',
      cancelText: '关闭',
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-[var(--color-muted)]/30 px-3 py-2">
      <span className="text-xs font-semibold text-[var(--color-muted-foreground)]">
        视频处理
      </span>
      <button
        type="button"
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        title="把已扫描的视频汇总到视频表（已存在不动）"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
      >
        {syncMutation.isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />}
        同步视频库
      </button>
      <ProcessingJobButton
        label="探测时长"
        title="ffprobe 探每个视频的时长，按区间归类（< 30s / 30s-5min / 5min-30min / 30min-90min / > 90min）"
        icon={<Clock className="h-3.5 w-3.5" />}
        api={durationProbeApi}
        onStartError={handleStartError}
      />
      <ProcessingJobButton
        label="按名称归类"
        title="按文件名正则去噪识别同系列（无 AI，纯字符串）"
        icon={<Tags className="h-3.5 w-3.5" />}
        api={nameGroupingApi}
        onStartError={handleStartError}
      />
      <ProcessingJobButton
        label="识别语言"
        title="whisper-cli --detect-language 抽 25% 位置 60s 音频判 ISO 码（GPU 串行，礼让播放）"
        icon={<Languages className="h-3.5 w-3.5" />}
        api={languageDetectApi}
        onStartError={handleStartError}
      />
      <ProcessingJobButton
        label="生成九宫格"
        title="ffmpeg tile=3x3 拼接 9 帧预览图，写到缓存目录"
        icon={<Grid3X3 className="h-3.5 w-3.5" />}
        api={thumbnailGridApi}
        onStartError={handleStartError}
      />
    </div>
  )
}

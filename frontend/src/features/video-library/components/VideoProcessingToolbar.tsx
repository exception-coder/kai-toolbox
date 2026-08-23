import { useEffect } from 'react'
import { Clock, FolderPlus, Grid3X3, Languages, Loader2, RefreshCw, Tags } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { addVideoScanRoot, durationProbeApi, getProcessingOverview, getVideoDirectoryScanStatus, getVideoScanRoots, getWhisperCapability, languageDetectApi, nameGroupingApi, startVideoDirectoryScan, thumbnailGridApi } from '../api'
import { ProcessingJobButton } from './ProcessingJobButton'

/**
 * 视频处理工具栏：单独一行放在 VideoListPanel 顶栏，承载本期 5 类操作：
 *
 * - **同步视频库**（阻塞）：把 treesize_node 里的视频 INSERT OR IGNORE 到 treesize_video
 * - **探测时长**（任务）：ffprobe 拿 duration_s + 算 duration_bucket
 * - **按名称归类**（任务）：正则去噪算系列签名 + 集数
 * - **识别语言**（任务）：抽 60s 音频判 ISO 码（cli `--detect-language` / ASR `POST /detect`）
 * - **生成九宫格**（任务）：ffmpeg 单条命令 tile=3x3 出 contact sheet
 *
 * 后续 3 类（人物年龄 / 视觉嵌入 / 聚类）落地时在本组件追加按钮，VideoListPanel 不动。
 */
export function VideoProcessingToolbar() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // 各任务"已完成/总数"累计进度。挂载拉一次；任务结束 / 同步后重拉。
  const overviewQuery = useQuery({
    queryKey: ['video-processing-overview'],
    queryFn: getProcessingOverview,
  })
  const ov = overviewQuery.data
  const refreshOverview = () => { void overviewQuery.refetch() }

  const rootsQuery = useQuery({ queryKey: ['video-scan-roots'], queryFn: getVideoScanRoots })
  const scanStatusQuery = useQuery({
    queryKey: ['video-directory-scan-status'], queryFn: getVideoDirectoryScanStatus,
    refetchInterval: query => query.state.data?.running ? 1_000 : false,
  })

  const addRootMutation = useMutation({
    mutationFn: addVideoScanRoot,
    onSuccess: () => rootsQuery.refetch(),
  })
  const directoryScanMutation = useMutation({
    mutationFn: startVideoDirectoryScan,
    onSuccess: () => scanStatusQuery.refetch(),
  })

  useEffect(() => {
    if (!scanStatusQuery.data?.running) return
    void queryClient.invalidateQueries({ queryKey: ['video-library'] })
    void queryClient.invalidateQueries({ queryKey: ['video-scan-roots'] })
  }, [scanStatusQuery.data?.running, scanStatusQuery.dataUpdatedAt, queryClient])

  // whisper 后端能力：mode 由启动参数定，进程生命周期内不变，拉一次即可。
  // 「识别语言」在 asr-service 模式下后端会直接 503，靠它把按钮提前禁掉。
  const whisperQuery = useQuery({
    queryKey: ['whisper-capability'],
    queryFn: getWhisperCapability,
    staleTime: Infinity,
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
        onClick={() => {
          const path = window.prompt('输入要扫描的视频目录绝对路径')?.trim()
          if (path) addRootMutation.mutate(path)
        }}
        disabled={addRootMutation.isPending}
        title="登记一个独立视频扫描目录"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        添加目录
      </button>
      <button
        type="button"
        onClick={() => directoryScanMutation.mutate()}
        disabled={directoryScanMutation.isPending || scanStatusQuery.data?.running || !rootsQuery.data?.length}
        title="只扫描已登记目录中的视频文件，不依赖磁盘空间扫描"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
      >
        {scanStatusQuery.data?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {scanStatusQuery.data?.running ? '扫描中' : `扫描目录${rootsQuery.data?.length ? ` (${rootsQuery.data.length})` : ''}`}
      </button>
      <ProcessingJobButton
        label="探测时长"
        title="ffprobe 探每个视频的时长，按区间归类（< 30s / 30s-5min / 5min-30min / 30min-90min / > 90min）"
        icon={<Clock className="h-3.5 w-3.5" />}
        api={durationProbeApi}
        onStartError={handleStartError}
        cumulativeDone={ov?.durationDone}
        cumulativeTotal={ov?.total}
        onSettled={refreshOverview}
      />
      <ProcessingJobButton
        label="按名称归类"
        title="按文件名正则去噪识别同系列（无 AI，纯字符串）"
        icon={<Tags className="h-3.5 w-3.5" />}
        api={nameGroupingApi}
        onStartError={handleStartError}
        cumulativeDone={ov?.nameGroupingDone}
        cumulativeTotal={ov?.total}
        onSettled={refreshOverview}
      />
      <ProcessingJobButton
        label="识别语言"
        title="抽 25% 位置 60s 音频判 ISO 码（GPU 串行，礼让播放）；按 whisper 模式走 cli --detect-language 或 ASR 服务 /detect"
        icon={<Languages className="h-3.5 w-3.5" />}
        api={languageDetectApi}
        onStartError={handleStartError}
        blockedReason={whisperQuery.data?.languageDetectBlockedReason ?? null}
        cumulativeDone={ov?.languageDone}
        cumulativeTotal={ov?.total}
        onSettled={refreshOverview}
      />
      <ProcessingJobButton
        label="生成九宫格"
        title="ffmpeg tile=3x3 拼接 9 帧预览图，写到缓存目录"
        icon={<Grid3X3 className="h-3.5 w-3.5" />}
        api={thumbnailGridApi}
        onStartError={handleStartError}
        cumulativeDone={ov?.gridDone}
        cumulativeTotal={ov?.total}
        onSettled={refreshOverview}
      />
    </div>
  )
}

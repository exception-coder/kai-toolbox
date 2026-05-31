import { http } from '@/lib/api'
import type { ProbeView, RecentRunsView, RunResultView } from './types'

/** 探测文件并返回每模式预判 + 命令预览。 */
export function probe(path: string, clipSeconds?: number) {
  const qs = new URLSearchParams({ path })
  if (clipSeconds != null) qs.set('clipSeconds', String(clipSeconds))
  return http<ProbeView>(`/ffmpeg-lab/probe?${qs.toString()}`)
}

/** 实跑某模式。临时文件类阻塞返回诊断 + 播放地址；MJPEG 直接返回 streaming 播放地址。 */
export function run(path: string, mode: string, clipSeconds?: number) {
  return http<RunResultView>('/ffmpeg-lab/run', {
    method: 'POST',
    body: JSON.stringify({ path, mode, clipSeconds }),
  })
}

/** 最近运行诊断（轮询）。 */
export function recentRuns() {
  return http<RecentRunsView>('/ffmpeg-lab/runs/recent')
}

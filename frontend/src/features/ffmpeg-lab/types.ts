// 与后端 tool-ffmpeg-lab 的 DTO 对应

export type PlayKind = 'native' | 'hls' | 'mjpeg'
export type Prediction = 'OK' | 'TRANSCODE' | 'FAIL'

export interface ProbeInfo {
  container: string
  videoCodec: string
  audioCodec: string
  durationSeconds: number
  nativelyPlayable: boolean
}

export interface ModeView {
  mode: string
  label: string
  playKind: PlayKind
  prediction: Prediction
  predictionReason: string
  command: string
}

export interface ProbeView {
  ffmpegAvailable: boolean
  probe: ProbeInfo
  modes: ModeView[]
}

export interface RunResultView {
  runId: string
  mode: string
  streaming: boolean
  success: boolean
  exitCode: number
  command: string
  firstByteMs: number | null
  totalMs: number | null
  outputBytes: number
  stderrTail: string[]
  playUrl: string
  playKind: PlayKind
}

export interface RunItem {
  runId: string
  mode: string
  success: boolean
  exitCode: number
  firstByteMs: number | null
  totalMs: number | null
  outputBytes: number
  stderrTail: string[]
  timestamp: number
}

export interface RecentRunsView {
  activeFfmpegCount: number
  runs: RunItem[]
}

import { useState } from 'react'
import { AlertTriangle, FlaskConical, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { probe as probeApi, run as runApi } from '../api'
import type { ModeView, ProbeView, RunResultView } from '../types'
import { ModeCard } from '../components/ModeCard'
import { LabPlayer } from '../components/LabPlayer'
import { RunDiagnosticsTable } from '../components/RunDiagnosticsTable'

/**
 * FFmpeg 转码实验台主页：输入本地路径 → 探测出每模式预判 + 命令 → 逐个运行看哪种能出 web，
 * 右侧实时播放 + 诊断表。
 */
export function FfmpegLabPage() {
  const [path, setPath] = useState('')
  const [clipSeconds, setClipSeconds] = useState('30')
  const [probing, setProbing] = useState(false)
  const [probeData, setProbeData] = useState<ProbeView | null>(null)
  const [runningMode, setRunningMode] = useState<string | null>(null)
  const [result, setResult] = useState<RunResultView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clipNum = () => {
    const n = Number(clipSeconds)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30
  }

  const handleProbe = async () => {
    if (!path.trim() || probing) return
    setProbing(true)
    setError(null)
    setProbeData(null)
    setResult(null)
    try {
      setProbeData(await probeApi(path.trim(), clipNum()))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setProbing(false)
    }
  }

  const handleRun = async (mode: ModeView) => {
    if (runningMode) return
    setRunningMode(mode.mode)
    setError(null)
    try {
      const res = await runApi(path.trim(), mode.mode, clipNum())
      setResult(res)
      if (!res.streaming && !res.success) {
        setError(`「${mode.label}」运行失败（exit ${res.exitCode}）——见下方诊断 stderr`)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setRunningMode(null)
    }
  }

  const p = probeData?.probe

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">FFmpeg 转码实验台</h1>
      </header>

      {/* 输入区 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-[var(--color-card)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">本地视频路径</label>
            <Input
              value={path}
              onChange={e => setPath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleProbe()}
              placeholder="例如 C:\Users\you\Desktop\video.amc"
              className="font-mono text-sm"
            />
          </div>
          <div className="w-full sm:w-32">
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">截断秒数（0=整片）</label>
            <Input
              type="number"
              min={0}
              value={clipSeconds}
              onChange={e => setClipSeconds(e.target.value)}
            />
          </div>
          <Button size="lg" onClick={handleProbe} disabled={!path.trim() || probing} className="shadow-sm">
            {probing ? <Loader2 className="animate-spin" /> : <Search />}
            探测
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
      </div>

      {probeData && !probeData.ffmpegAvailable && (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          FFmpeg 不可用，请在 application.yml 配置 <code>toolbox.ffmpeg.binary</code> 后重启。
        </div>
      )}

      {p && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* 左列：探测信息 + 模式卡 */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-[var(--color-card)] p-4 text-sm">
              <div className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">探测结果</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Info label="容器" value={p.container} />
                <Info label="视频编码" value={p.videoCodec} />
                <Info label="音频编码" value={p.audioCodec} />
                <Info label="时长" value={`${p.durationSeconds.toFixed(2)}s`} />
                <Info label="浏览器原生可播" value={p.nativelyPlayable ? '是' : '否'} />
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {probeData.modes.map(mode => (
                <ModeCard
                  key={mode.mode}
                  mode={mode}
                  running={runningMode === mode.mode}
                  active={result?.mode === mode.mode}
                  disabled={runningMode != null}
                  onRun={handleRun}
                />
              ))}
            </div>
          </div>

          {/* 右列：播放 + 诊断 */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-[var(--color-card)] p-4">
              <div className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
                播放预览{result && `（${result.mode} · ${formatBytes(result.outputBytes)}）`}
              </div>
              {result && (result.success || result.streaming) ? (
                <LabPlayer key={result.runId} playUrl={result.playUrl} playKind={result.playKind} />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
                  选左侧某个模式「运行」后在此播放
                </div>
              )}
            </div>
            <RunDiagnosticsTable />
          </div>
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="truncate font-mono text-xs" title={value}>{value}</dd>
    </>
  )
}

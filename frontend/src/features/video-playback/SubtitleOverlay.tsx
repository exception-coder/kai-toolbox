import { useEffect, useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  availabilityFor,
  getTranslator,
  isTranslatorSupported,
  normalizeWhisperLang,
  translateCached,
} from '@/lib/translator'

export type SubtitleMode = 'original' | 'translated' | 'dual'

interface Props {
  video: HTMLVideoElement | null
  mode: SubtitleMode
  sourceLang: string
  targetLang?: string
}

interface ActiveLine {
  text: string
  translated?: string
  translating?: boolean
  error?: string
}

/**
 * Renders the active subtitle cue(s) over the video.
 *
 * Two translation strategies, in priority order:
 *  1. Server-translated VTT (DeepLX) — a second <track srcLang="zh"> attached by VideoPlayer.
 *     Works on all browsers including mobile. No API keys needed.
 *  2. Chrome Translator API — on-device Gemini Nano, desktop Chrome only.
 *
 * Both tracks are forced to `hidden` so the browser's native subtitle UI is suppressed.
 * This component renders its own DOM for full styling control.
 */
export function SubtitleOverlay({ video, mode, sourceLang, targetLang = 'zh-Hans' }: Props) {
  const [originalLines, setOriginalLines] = useState<string[]>([])
  const [translatedLines, setTranslatedLines] = useState<string[]>([])
  // Chrome Translator API state (fallback when no server-translated track)
  const [apiLines, setApiLines] = useState<ActiveLine[]>([])
  const [translatorReady, setTranslatorReady] = useState<boolean | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [hasServerTranslation, setHasServerTranslation] = useState(false)

  const normSource = normalizeWhisperLang(sourceLang)
  const wantsTranslation = mode !== 'original'
  const useApiTranslation = wantsTranslation && !hasServerTranslation

  // Attach to both tracks: original (any lang) and translated (srcLang="zh").
  // Re-runs whenever the video element changes (new video selected).
  useEffect(() => {
    if (!video) return
    let originalTrack: TextTrack | null = null
    let translatedTrack: TextTrack | null = null
    const cleanups: (() => void)[] = []

    const attachTrack = (track: TextTrack) => {
      track.mode = 'hidden'
      const isZh = track.language === 'zh' || track.label === '中文'

      const onCueChange = () => {
        const cues = track.activeCues
        const texts: string[] = []
        if (cues) {
          for (let i = 0; i < cues.length; i++) {
            texts.push((cues[i] as VTTCue).text.replace(/<[^>]*>/g, '').trim())
          }
        }
        if (isZh) {
          setTranslatedLines(texts)
          if (texts.length > 0) setHasServerTranslation(true)
        } else {
          setOriginalLines(texts)
          // Mirror into apiLines skeleton (translated will be filled by Translator API)
          setApiLines(texts.map(t => ({ text: t })))
        }
      }

      track.addEventListener('cuechange', onCueChange)
      onCueChange()
      cleanups.push(() => track.removeEventListener('cuechange', onCueChange))

      if (isZh) {
        translatedTrack = track
        setHasServerTranslation(true)
      } else {
        originalTrack = track
      }
    }

    const tryAttachAll = () => {
      const tracks = video.textTracks
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i]
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue
        const isZh = t.language === 'zh' || t.label === '中文'
        if (isZh && !translatedTrack) attachTrack(t)
        if (!isZh && !originalTrack) attachTrack(t)
      }
    }

    tryAttachAll()

    const onAddTrack = () => tryAttachAll()
    video.textTracks.addEventListener('addtrack', onAddTrack)
    video.addEventListener('loadedmetadata', tryAttachAll)
    video.addEventListener('loadeddata', tryAttachAll)

    return () => {
      cleanups.forEach(fn => fn())
      video.textTracks.removeEventListener('addtrack', onAddTrack)
      video.removeEventListener('loadedmetadata', tryAttachAll)
      video.removeEventListener('loadeddata', tryAttachAll)
      setOriginalLines([])
      setTranslatedLines([])
      setApiLines([])
      setHasServerTranslation(false)
    }
  }, [video])

  // Chrome Translator API — only when no server-translated track is available.
  useEffect(() => {
    if (!useApiTranslation || normSource === '') {
      setTranslatorReady(null)
      setDownloadProgress(null)
      return
    }
    if (!isTranslatorSupported()) {
      setTranslatorReady(false)
      return
    }
    let aborted = false
    setTranslatorReady(null)
    setDownloadProgress(null)
    ;(async () => {
      const status = await availabilityFor(normSource, targetLang)
      if (aborted) return
      if (status === 'unavailable') { setTranslatorReady(false); return }
      try {
        await getTranslator(normSource, targetLang, p => { if (!aborted) setDownloadProgress(p) })
        if (!aborted) { setTranslatorReady(true); setDownloadProgress(null) }
      } catch {
        if (!aborted) setTranslatorReady(false)
      }
    })()
    return () => { aborted = true }
  }, [useApiTranslation, normSource, targetLang])

  // Per-cue lazy translation via Chrome Translator API.
  useEffect(() => {
    if (!useApiTranslation || translatorReady !== true) return
    const pending = apiLines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.translated === undefined && !line.translating)
    if (pending.length === 0) return

    let aborted = false
    setApiLines(prev => prev.map((l, i) =>
      pending.some(p => p.idx === i) ? { ...l, translating: true } : l))

    ;(async () => {
      try {
        const translator = await getTranslator(normSource, targetLang)
        for (const { line, idx } of pending) {
          if (aborted) return
          try {
            const translated = await translateCached(translator, line.text)
            if (aborted) return
            setApiLines(prev => {
              const copy = [...prev]
              if (copy[idx]?.text === line.text) copy[idx] = { ...copy[idx], translated, translating: false }
              return copy
            })
          } catch (e) {
            if (aborted) return
            setApiLines(prev => {
              const copy = [...prev]
              if (copy[idx]?.text === line.text)
                copy[idx] = { ...copy[idx], translating: false, error: e instanceof Error ? e.message : String(e) }
              return copy
            })
          }
        }
      } catch { /* getTranslator failure handled by readiness effect */ }
    })()
    return () => { aborted = true }
  }, [apiLines, useApiTranslation, translatorReady, normSource, targetLang])

  // Whisper annotates non-speech audio in English: "(suspenseful music)", "(applause)", etc.
  const isAudioAnnotation = (t: string) => /^\s*\([^)]*\)\s*$/.test(t)
  const visibleOriginal = originalLines.filter(t => !isAudioAnnotation(t))

  // Nothing to show (no active cues, or language pack still downloading)
  if (visibleOriginal.length === 0 && translatedLines.length === 0) {
    if (useApiTranslation && downloadProgress !== null) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-4">
          <span className="inline-flex items-center gap-1.5 rounded bg-black/65 px-2 py-1 text-[11px] text-white/80">
            <Languages className="h-3 w-3" />
            语言包下载 {Math.round(downloadProgress * 100)}%
          </span>
        </div>
      )
    }
    return null
  }

  const showOriginal = mode === 'original' || mode === 'dual'
  const showTranslated = wantsTranslation

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5 px-6 text-center">
      {visibleOriginal.map((text, idx) => (
        <div key={idx} className="flex flex-col items-center gap-0.5">
          {showOriginal && (
            <span
              className={cn(
                'inline-block max-w-full rounded bg-black/70 px-2.5 py-0.5 leading-snug text-white',
                mode === 'dual' ? 'text-xs text-white/70' : 'text-sm font-medium',
              )}
              title={text}
            >
              {text}
            </span>
          )}
          {showTranslated && (
            <ServerOrApiTranslation
              serverText={translatedLines[idx]}
              apiLine={apiLines[idx]}
              useApi={useApiTranslation}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ServerOrApiTranslation({
  serverText,
  apiLine,
  useApi,
}: {
  serverText: string | undefined
  apiLine: ActiveLine | undefined
  useApi: boolean
}) {
  if (serverText) {
    return (
      <span className="inline-block max-w-full rounded bg-black/70 px-2.5 py-0.5 text-sm font-medium leading-snug text-white">
        {serverText}
      </span>
    )
  }
  if (!useApi || !apiLine) return null
  return (
    <span
      className="inline-block max-w-full rounded bg-black/70 px-2.5 py-0.5 text-sm font-medium leading-snug text-white"
      title={apiLine.translated}
    >
      {apiLine.translating ? (
        <Loader2 className="inline h-3 w-3 animate-spin opacity-60" />
      ) : apiLine.error ? (
        <span className="text-xs text-amber-300">[翻译失败]</span>
      ) : (
        apiLine.translated ?? ' '
      )}
    </span>
  )
}

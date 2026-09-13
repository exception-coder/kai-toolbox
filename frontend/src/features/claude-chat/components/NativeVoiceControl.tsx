import { useEffect, useRef } from 'react'
import { AudioLines, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNativeVoice } from '../hooks/useNativeVoice'
import { voiceAvailability, type VoiceTransport } from '../lib/nativeVoice'

interface Props {
  sessionId: string | null
  transport: VoiceTransport
  connected: boolean
  disabled?: boolean
  busy?: boolean
}

export function NativeVoiceControl({ sessionId, transport, connected, disabled, busy }: Props) {
  const voice = useNativeVoice(sessionId, transport, connected)
  const trigger = useRef<HTMLButtonElement>(null)
  const active = voice.state === 'connecting' || voice.state === 'connected'
  const wasActive = useRef(false)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (wasActive.current && !active) restoreFocus.current = true
    wasActive.current = active
    if (restoreFocus.current && !active && !busy && !disabled && connected) {
      trigger.current?.focus()
      restoreFocus.current = false
    }
  }, [active, busy, disabled, connected])
  const unavailable = voiceAvailability()
  return (
    <div className="min-w-0 border-t px-3 py-2" aria-label="原生语音对话">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={trigger} type="button" variant="ghost" size="sm"
          disabled={disabled || !connected || !sessionId || Boolean(busy && !active) || Boolean(unavailable)}
          onClick={() => { if (!active) void voice.start() }} aria-pressed={active}
          title={unavailable || (busy && !active ? '请等待当前代码任务结束后开始语音' : '与当前 Codex 会话进行原生语音对话')}>
          {voice.state === 'connecting' ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <AudioLines className="size-4" />}
          {active ? voice.state === 'connecting' ? '正在连接语音…' : voice.muted ? '麦克风已静音' : '语音已连接' : '语音对话'}
        </Button>
        {active && <>
          <Button type="button" variant="ghost" size="sm" onClick={voice.toggleMute}
            disabled={voice.state !== 'connected'} aria-pressed={voice.muted} aria-label={voice.muted ? '开启麦克风' : '静音麦克风'}>
            {voice.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {voice.muted ? '取消静音' : '静音'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={voice.stop}>
            <PhoneOff className="size-4" />{voice.state === 'connecting' ? '取消连接' : '结束通话'}
          </Button>
        </>}
        <span className="text-xs text-[var(--color-muted-foreground)]" role="status">
          {active ? '结束通话后，已启动的代码任务继续执行' : unavailable || (busy ? '当前代码任务结束后可开始语音' : '原生语音 · 实验功能，可连续交流')}
        </span>
      </div>
      {voice.error && <p role="alert" className="mt-2 break-words text-xs text-[var(--color-destructive)]">
        {voice.error}。可重新点击“语音对话”，或继续使用文字。
      </p>}
      {(voice.transcript.user || voice.transcript.assistant) && <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm" role="log" aria-label="实时语音字幕">
        {voice.transcript.user && <p className="break-words"><span className="text-[var(--color-muted-foreground)]">你 · </span>{voice.transcript.user}</p>}
        {voice.transcript.assistant && <p className="break-words"><span className="text-[var(--color-muted-foreground)]">Codex · </span>{voice.transcript.assistant}</p>}
      </div>}
    </div>
  )
}

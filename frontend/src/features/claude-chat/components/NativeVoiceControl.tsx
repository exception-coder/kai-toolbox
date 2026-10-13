import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { AudioLines, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoiceRecovery } from '../hooks/useVoiceRecovery'
import { voiceAvailability, voiceErrorRetryHint, type VoiceTransport } from '../lib/nativeVoice'

interface Props {
  sessionId: string | null
  transport: VoiceTransport
  connected: boolean
  disabled?: boolean
  busy?: boolean
  mobileDisclosure?: boolean
  hideIdle?: boolean
  onReturnFocus?: () => void
  controlRef?: Ref<{ start: () => void }>
}

export function NativeVoiceControl({ sessionId, transport, connected, disabled, busy, mobileDisclosure, hideIdle, onReturnFocus, controlRef }: Props) {
  const voice = useVoiceRecovery(sessionId, transport, { connected, busy, disabled })
  const trigger = useRef<HTMLButtonElement>(null)
  const active = voice.state === 'connecting' || voice.state === 'connected'
  const inactive = !active && !voice.recoverable && !voice.error && !voice.notice
  useImperativeHandle(controlRef, () => ({ start: () => {
    if (!active && !disabled && connected && sessionId && !voiceAvailability()) voice.start()
  } }))
  const wasEngaged = useRef(false)
  const restoreFocus = useRef(false)
  useEffect(() => {
    const engaged = active
    if (wasEngaged.current && !engaged) restoreFocus.current = true
    wasEngaged.current = engaged
    if (restoreFocus.current && !active && !disabled && connected) {
      if (hideIdle && inactive) onReturnFocus?.()
      else trigger.current?.focus()
      restoreFocus.current = false
    }
  }, [active, disabled, connected, hideIdle, inactive, onReturnFocus])
  const unavailable = voiceAvailability()
  return (
    <div className={`${inactive ? hideIdle ? 'hidden ' : mobileDisclosure ? 'hidden md:block ' : '' : ''}min-w-0 border-t px-3 py-2`} aria-label="原生语音对话">
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={trigger} type="button" variant="ghost" size="sm"
          disabled={disabled || !connected || !sessionId || Boolean(unavailable)}
          onClick={() => { if (!active) voice.start() }} aria-pressed={active}
          title={unavailable || (busy && !active ? '重新连接原会话音频，代码任务继续执行' : '与当前 Codex 会话进行原生语音对话')}>
          {voice.state === 'connecting' ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <AudioLines className="size-4" />}
          {active ? voice.state === 'connecting' ? '正在连接语音…' : voice.muted ? '麦克风已静音' : '语音已连接'
            : voice.recoverable ? '恢复语音' : '语音对话'}
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
          {active ? '结束通话后，已启动的代码任务继续执行' : unavailable || voice.notice || (voice.recoverable
            ? '语音已中断，点击恢复；代码任务无需停止'
            : busy ? '可重新连接原语音会话，代码任务继续执行' : '原生语音 · 实验功能，可连续交流')}
        </span>
      </div>
      {voice.error && <p role="alert" className="mt-2 break-words text-xs text-[var(--color-destructive)]">
        {voice.error}{voiceErrorRetryHint(voice.error, voice.recoverable)}
      </p>}
    </div>
  )
}

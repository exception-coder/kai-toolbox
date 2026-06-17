import { ArrowUp, Loader2, Mic, X } from 'lucide-react'
import type { VoiceModeMachine, VoiceState } from '../../hooks/useVoiceModeMachine'

const STATE_LABEL: Record<VoiceState, string> = {
  idle: '点击说话',
  listening: '正在聆听…',
  thinking: '思考中…',
  speaking: '回应中…',
}

/** 语音模式底部控制：状态文案 + 主操作（说话 / 取消·发送 / 转写中）。退出按钮在右上。 */
export function VoiceModeControls({ machine, onExit }: { machine: VoiceModeMachine; onExit: () => void }) {
  const { state, recording, seconds, busy, error, supported, startTalk, stopAndSend, cancelTalk } = machine

  return (
    <>
      <button
        type="button"
        onClick={onExit}
        aria-label="退出语音模式"
        title="退出语音模式"
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
        <div className="h-5 text-sm text-white/70">
          {error ?? (recording ? `${STATE_LABEL.listening} ${seconds}s` : STATE_LABEL[state])}
        </div>

        {busy ? (
          <div className="flex size-16 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md">
            <Loader2 className="size-7 animate-spin" />
          </div>
        ) : recording ? (
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={cancelTalk}
              aria-label="取消"
              className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md hover:bg-white/20"
            >
              <X className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => void stopAndSend()}
              aria-label="发送"
              className="flex size-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg hover:opacity-90"
            >
              <ArrowUp className="size-8" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startTalk()}
            disabled={!supported}
            aria-label="开始说话"
            className="flex size-16 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-md hover:bg-white/20 disabled:opacity-40"
          >
            <Mic className="size-7" />
          </button>
        )}
      </div>
    </>
  )
}

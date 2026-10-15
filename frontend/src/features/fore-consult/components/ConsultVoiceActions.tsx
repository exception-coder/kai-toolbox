import { useState } from 'react'
import { NativeVoiceControl, VoiceInputButton } from '@/features/claude-chat/public-api/voice'
import type { UseClaudeChatSocket } from '@/features/claude-chat/public-api'

/** 语音继承当前咨询，不另建会话或选择模型、数据库。 */
export function ConsultVoiceActions({ chat, disabled, draftPending, onText }: {
  chat?: UseClaudeChatSocket
  disabled: boolean
  draftPending?: boolean
  onText: (text: string) => void
}) {
  const [dictating, setDictating] = useState(false)
  const [talking, setTalking] = useState(false)
  const native = chat?.currentEngine === 'codex' && chat.currentProviderKind === 'official'
    && !chat.currentProviderBaseUrl
  return <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1" aria-label="咨询语音">
    <VoiceInputButton scope="consultation" onText={onText} disabled={disabled || talking} onActiveChange={setDictating}
      className="size-11 shrink-0" />
    {native && <NativeVoiceControl sessionId={chat.sessionId} transport={chat.voiceTransport}
      connected={chat.state === 'ready'} busy={chat.running} context="consultation" compact
      disabledReason={draftPending ? '请先发送或清空当前草稿，再开始语音对话' : '请等待当前操作完成后重试'}
      disabled={disabled || dictating || draftPending || Boolean(chat.pending)} onActiveChange={setTalking} />}
  </div>
}

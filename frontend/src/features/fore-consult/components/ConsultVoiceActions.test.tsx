import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultVoiceActions } from './ConsultVoiceActions'
import type { UseClaudeChatSocket } from '@/features/claude-chat/public-api'

const controls = vi.hoisted(() => ({ native: vi.fn() }))
vi.mock('@/features/claude-chat/public-api/voice', () => ({
  NativeVoiceControl: (props: { disabled: boolean; onActiveChange: (active: boolean) => void }) => {
    controls.native(props)
    return <button disabled={props.disabled} onClick={() => props.onActiveChange(true)}>语音对话</button>
  },
  VoiceInputButton: (props: { disabled: boolean; scope: string; onText: (text: string) => void }) =>
    <button disabled={props.disabled} data-scope={props.scope} onClick={() => props.onText('语音文字')}>语音输入</button>,
}))
const chat = { sessionId: 'consult-runtime', state: 'ready', currentEngine: 'codex', currentProviderKind: 'official',
  running: false, voiceTransport: { start: vi.fn(), control: vi.fn(), subscribe: () => () => {} } } as unknown as UseClaudeChatSocket
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('passes the original consultation transport and locks dictation while talking', () => {
  render(<ConsultVoiceActions chat={chat} disabled={false} onText={vi.fn()} />)
  expect(controls.native).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: chat.sessionId,
    transport: chat.voiceTransport, context: 'consultation', compact: true }))
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  expect(screen.getByRole('button', { name: '语音输入' })).toBeDisabled()
})

it('preserves unsent drafts and provides consultation dictation for other engines', () => {
  const onText = vi.fn()
  const page = render(<ConsultVoiceActions chat={chat} disabled={false} draftPending onText={onText} />)
  expect(screen.getByRole('button', { name: '语音对话' })).toBeDisabled()
  page.rerender(<ConsultVoiceActions chat={{ ...chat, currentEngine: 'claude' }} disabled={false} onText={onText} />)
  expect(screen.queryByRole('button', { name: '语音对话' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
  expect(screen.getByRole('button', { name: '语音输入' })).toHaveAttribute('data-scope', 'consultation')
  expect(onText).toHaveBeenCalledWith('语音文字')
})

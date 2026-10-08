import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatRuntimeOverlays } from './ChatRuntimeOverlays'

const controls = vi.hoisted(() => ({
  chat: null as null | { sessionId: string; pendingSessions: Array<{ sessionId: string; kind: string }> },
  floating: false,
  pathname: '/tools/claude-chat',
  voiceMode: false,
  stalledVoice: false,
  loads: { floating: 0, voice: 0, questions: 0 },
}))
vi.mock('./ChatRuntimeContext', () => ({ useChatRuntime: () => controls, isChatRoute: (path: string) => path === '/tools/claude-chat' }))
vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useLocation: () => ({ pathname: controls.pathname }),
}))
vi.mock('../components/FloatingChatWindow', () => {
  controls.loads.floating++
  return { FloatingChatWindow: ({ initialCompact }: { initialCompact?: boolean }) => controls.floating
    ? <div>{initialCompact ? 'floating-compact' : 'floating-ready'}</div>
    : null }
})
vi.mock('../components/voice/VoiceModeView', () => {
  controls.loads.voice++
  return { VoiceModeView: () => {
    if (controls.stalledVoice) throw new Promise(() => {})
    return <div>voice-ready</div>
  } }
})
vi.mock('../components/GlobalPendingQuestionModal', () => {
  controls.loads.questions++
  return { GlobalPendingQuestionModal: () => <div>background-question-ready</div> }
})

afterEach(() => {
  cleanup()
  controls.chat = null
  controls.floating = false
  controls.pathname = '/tools/claude-chat'
  controls.voiceMode = false
  controls.stalledVoice = false
})

describe('chat overlay downloads', () => {
  it('keeps hidden layers unloaded, then opens the requested layer without needing a new chat', async () => {
    const view = render(<ChatRuntimeOverlays />)
    expect(controls.loads).toEqual({ floating: 0, voice: 0, questions: 0 })

    controls.chat = { sessionId: 'current', pendingSessions: [] }
    view.rerender(<ChatRuntimeOverlays />)
    expect(controls.loads).toEqual({ floating: 0, voice: 0, questions: 0 })

    controls.floating = true
    view.rerender(<ChatRuntimeOverlays />)
    expect(controls.loads).toEqual({ floating: 0, voice: 0, questions: 0 })
    controls.pathname = '/'
    view.rerender(<ChatRuntimeOverlays />)
    expect(await screen.findByText('floating-ready')).toBeInTheDocument()
    expect(controls.loads).toEqual({ floating: 1, voice: 0, questions: 0 })

    controls.floating = false
    controls.chat.pendingSessions = [{ sessionId: 'current', kind: 'question' }]
    view.rerender(<ChatRuntimeOverlays />)
    expect(screen.queryByText('floating-ready')).not.toBeInTheDocument()
    expect(controls.loads.questions).toBe(0)

    controls.floating = true
    view.rerender(<ChatRuntimeOverlays />)
    expect(screen.getByText('floating-ready')).toBeInTheDocument()
    expect(controls.loads.floating).toBe(1)

    controls.pathname = '/tools/claude-chat'
    view.rerender(<ChatRuntimeOverlays />)
    expect(screen.getByText('floating-ready')).not.toBeVisible()
    controls.pathname = '/'
    view.rerender(<ChatRuntimeOverlays />)
    expect(screen.getByText('floating-ready')).toBeVisible()

    controls.chat.pendingSessions.push({ sessionId: 'background', kind: 'question' })
    view.rerender(<ChatRuntimeOverlays />)
    expect(await screen.findByText('background-question-ready')).toBeInTheDocument()
    expect(controls.loads.voice).toBe(0)

    controls.voiceMode = true
    view.rerender(<ChatRuntimeOverlays />)
    expect(await screen.findByText('voice-ready')).toBeInTheDocument()
    expect(controls.loads.voice).toBe(1)
  })

  it('keeps the floating window visible when another layer is still loading', async () => {
    controls.chat = { sessionId: 'current', pendingSessions: [] }
    controls.pathname = '/'
    controls.voiceMode = true
    controls.stalledVoice = true
    const view = render(<ChatRuntimeOverlays />)
    controls.floating = true
    view.rerender(<ChatRuntimeOverlays />)

    expect(await screen.findByText('floating-ready')).toBeInTheDocument()
    expect(screen.queryByText('voice-ready')).not.toBeInTheDocument()
  })

  it('retains the initial compact preference of a restored floating window', async () => {
    controls.chat = { sessionId: 'current', pendingSessions: [] }
    controls.pathname = '/'
    controls.floating = true
    render(<ChatRuntimeOverlays />)
    expect(await screen.findByText('floating-compact')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('chat runtime public entry', () => {
  it('keeps provider and hook connected when the runtime module is evaluated again', async () => {
    localStorage.clear()
    const firstRuntime = await import('./runtime')
    const { MemoryRouter } = await import('react-router-dom')

    vi.resetModules()
    const reloadedRuntime = await import('../runtime/ChatRuntimeContext')

    function RuntimeProbe() {
      const runtime = reloadedRuntime.useChatRuntime()
      return <span>{typeof runtime.activate === 'function' ? 'runtime-ready' : 'runtime-missing'}</span>
    }

    render(
      <MemoryRouter>
        <firstRuntime.ChatRuntimeProvider>
          <RuntimeProbe />
        </firstRuntime.ChatRuntimeProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('runtime-ready')).toBeInTheDocument()
  })
})

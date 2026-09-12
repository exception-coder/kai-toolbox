import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DeliveryRegistrationDialog } from './DeliveryRegistrationDialog'

vi.mock('./PrdDraftDialog', () => ({
  PrdDraftDialog: ({ onCreated }: { onCreated: (sessionId: string) => void }) => (
    <button type="button" onClick={() => onCreated('session-1')}>完成标准登记</button>
  ),
}))

describe('DeliveryRegistrationDialog', () => {
  it('returns the created session to the delivery center without navigating away', () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()
    render(<MemoryRouter><DeliveryRegistrationDialog mode="standard" onClose={onClose} onCreated={onCreated} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: '完成标准登记' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onCreated).toHaveBeenCalledWith('session-1')
  })
})

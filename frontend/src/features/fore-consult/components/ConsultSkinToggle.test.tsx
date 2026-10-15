import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultSkinToggle, useConsultSkin } from './ConsultSkinToggle'

const key = 'toolbox.fore-consult.skin.v2'
const legacyKey = 'toolbox.fore-consult.skin'
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.removeItem(key); localStorage.removeItem(legacyKey) })

function Preview({ onMount = () => {} }: { onMount?: () => void }) {
  const { skin, toggleSkin, remembered } = useConsultSkin()
  const [draft, setDraft] = useState('待确认口径')
  useEffect(onMount, [onMount])
  return <div data-testid="consult" data-consult-skin={skin}>
    <ConsultSkinToggle skin={skin} onToggle={toggleSkin} remembered={remembered} />
    <textarea aria-label="咨询草稿" value={draft} onChange={event => setDraft(event.target.value)} />
  </div>
}

it('toggles only the skin and preserves the same mounted draft while persisting the selection', () => {
  const onMount = vi.fn()
  render(<Preview onMount={onMount} />)
  const input = screen.getByRole('textbox', { name: '咨询草稿' })
  fireEvent.change(input, { target: { value: '请保留当前会话与附件' } })
  const button = screen.getByRole('button', { name: 'Forge 风格' })
  expect(button).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(button)
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'glass')
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(localStorage.getItem(key)).toBe('glass')
  expect(screen.getByRole('textbox')).toBe(input)
  expect(input).toHaveValue('请保留当前会话与附件')
  expect(onMount).toHaveBeenCalledOnce()
  cleanup()
  render(<Preview />)
  expect(screen.getByRole('button', { name: 'Forge 风格' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Forge 风格' }))
  expect(localStorage.getItem(key)).toBe('forge')
})

it('ignores invalid stored skin names and defaults to Forge', () => {
  localStorage.setItem(key, 'unexpected')
  render(<Preview />)
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'forge')
})

it.each(['glass', 'forge'])('resets legacy %s preferences to the shared Forge default without touching other settings', legacySkin => {
  localStorage.setItem(legacyKey, legacySkin)
  render(<Preview />)
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'forge')
  expect(localStorage.getItem(legacyKey)).toBe(legacySkin)
  fireEvent.click(screen.getByRole('button', { name: 'Forge 风格' }))
  cleanup()
  render(<Preview />)
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'glass')
})

it('uses Forge when reading local storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
  render(<Preview />)
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'forge')
})

it('can still switch for this visit when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
  render(<Preview />)
  fireEvent.click(screen.getByRole('button', { name: 'Forge 风格' }))
  expect(screen.getByTestId('consult')).toHaveAttribute('data-consult-skin', 'glass')
  expect(screen.getByRole('status')).toHaveTextContent('仅本次')
  expect(screen.getByRole('textbox')).toHaveValue('待确认口径')
})

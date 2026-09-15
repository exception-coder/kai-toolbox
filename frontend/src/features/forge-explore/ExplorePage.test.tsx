// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ExplorePage from './pages/ExplorePage'

afterEach(cleanup)

function openPage() {
  return render(<MemoryRouter><ExplorePage /></MemoryRouter>)
}

describe('Forge capability showcase', () => {
  it('filters capabilities and restores all without affecting featured entries', () => {
    openPage()
    const explorer = screen.getByRole('region', { name: '找到你的下一步。' })
    fireEvent.click(screen.getByRole('button', { name: '质量' }))
    expect(within(explorer).getAllByRole('button', { name: /^了解/ })).toHaveLength(1)
    expect(within(explorer).getByRole('button', { name: '了解回归评测' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '了解彩虹胶囊' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(within(explorer).getAllByRole('button', { name: /^了解/ })).toHaveLength(7)
  })

  it('keeps rainbow integration distinct from requirements and exposes a return route', () => {
    openPage()
    fireEvent.click(screen.getAllByRole('button', { name: '了解彩虹胶囊' })[0])
    const drawer = screen.getByRole('dialog', { name: '彩虹胶囊' })
    expect(within(drawer).getByRole('link', { name: '了解如何接入' }).getAttribute('href')).toBe('/tools/assistant-integration')
    expect(within(drawer).getByText(/AI 交付中心/)).toBeTruthy()
  })
})

import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileConsultComposer } from './MobileConsultComposer'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps draft and attachment state outside the editor and delegates sending to the existing controller', async () => {
  const send = vi.fn(), remove = vi.fn()
  function Harness() {
    const [text, setText] = useState('')
    return <MobileConsultComposer value={text} onChange={setText} attachments={[{ name: 'a-long-screenshot-name.png', path: 'p', url: 'blob:test' }]} onFiles={vi.fn()} onRemove={remove} onPaste={vi.fn()} onSend={send} canSend={Boolean(text)} />
  }
  render(<Harness />)
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveTextContent('附件 1')
  expect(screen.queryByText('a-long-screenshot-name.png')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '编辑咨询' }))
  fireEvent.change(await screen.findByRole('textbox', { name: '咨询问题描述' }), { target: { value: '核对这个订单' } })
  fireEvent.click(screen.getByText('附件 · 1'))
  fireEvent.click(screen.getByRole('button', { name: '移除附件 a-long-screenshot-name.png' }))
  expect(remove).toHaveBeenCalledWith('p')
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveTextContent('核对这个订单')
  fireEvent.click(screen.getByRole('button', { name: '发送咨询' }))
  expect(send).toHaveBeenCalledTimes(1)
})

it('adapts the editor to visual viewport resize/scroll and removes listeners after closing', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 360, offsetTop: 24 })
  vi.stubGlobal('visualViewport', viewport)
  const remove = vi.spyOn(viewport, 'removeEventListener')
  render(<MobileConsultComposer value="草稿" onChange={vi.fn()} attachments={[]} onFiles={vi.fn()} onRemove={vi.fn()} onPaste={vi.fn()} onSend={vi.fn()} canSend={false} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑咨询' }))
  const editor = await screen.findByRole('dialog')
  expect(editor).toHaveStyle({ height: '360px', top: '24px' })
  viewport.height = 240; viewport.offsetTop = 48
  viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'))
  expect(editor).toHaveStyle({ height: '240px', top: '48px' })
  expect(screen.getByRole('button', { name: '发送咨询' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveFocus()
})

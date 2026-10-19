import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileConsultComposer } from './MobileConsultComposer'
import { CodexSessionOptions } from '@/features/claude-chat/public-api'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps model labels read-only for ordinary users even when options are supplied', async () => {
  render(<MobileConsultComposer value="" onChange={vi.fn()} attachments={[]} onFiles={vi.fn()} onRemove={vi.fn()} onPaste={vi.fn()} onSend={vi.fn()} canSend={false} modelLabel="业务默认模型" options={<button>管理员设置</button>} />)
  expect(screen.queryByRole('button', { name: '配置咨询模型' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('业务默认模型'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '编辑咨询' }))
  const editor = await screen.findByRole('dialog')
  expect(within(editor).getByText('业务默认模型')).toBeVisible()
  expect(within(editor).queryByRole('button', { name: '配置咨询模型' })).not.toBeInTheDocument()
  expect(within(editor).queryByText('管理员设置')).not.toBeInTheDocument()
})

it('lets administrators configure embedded options and removes access when permission changes', async () => {
  const changeModel = vi.fn()
  const props = { value: '保留草稿', onChange: vi.fn(), attachments: [], onFiles: vi.fn(), onRemove: vi.fn(), onPaste: vi.fn(), onSend: vi.fn(), canSend: false,
    modelLabel: '当前模型', options: <CodexSessionOptions embedded models={[{ value: 'test-model', displayName: '测试模型', description: '' }]} model={null} reasoningEffort="low" speed="default" onModelChange={changeModel} onOptionsChange={vi.fn()} /> }
  const view = render(<MobileConsultComposer {...props} canConfigureModel />)
  fireEvent.click(screen.getByRole('button', { name: '配置咨询模型' }))
  const editor = await screen.findByRole('dialog')
  expect(within(editor).getByRole('region', { name: '咨询模型配置' })).toBeVisible()
  fireEvent.click(within(editor).getByRole('button', { name: /^模型 / }))
  fireEvent.click(within(editor).getByRole('button', { name: '测试模型' }))
  expect(changeModel).toHaveBeenCalledWith('test-model')
  expect(within(editor).getByRole('textbox', { name: '咨询问题描述' })).toHaveValue('保留草稿')
  view.rerender(<MobileConsultComposer {...props} canConfigureModel={false} />)
  expect(within(editor).queryByRole('region', { name: '咨询模型配置' })).not.toBeInTheDocument()
  expect(within(editor).queryByRole('button', { name: '配置咨询模型' })).not.toBeInTheDocument()
})

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

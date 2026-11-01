import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrawioPreview } from './DrawioPreview'

afterEach(cleanup)
const model = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'

describe('draw.io 隔离画布', () => {
  it('只有当前 iframe 的正确回执才能结束加载，重试隔离旧回执', async () => {
    render(<DrawioPreview content={model} name="架构" />)
    const frame = await screen.findByTitle('架构 draw.io 画布') as HTMLIFrameElement
    const token = frame.srcdoc.match(/var token='([^']+)'/)![1]
    const reply = (state: string, source: Window | null = frame.contentWindow, nonce = token) => {
      fireEvent(window, new MessageEvent('message', { origin: 'null', source, data: { type: 'forge-drawio', token: nonce, state } }))
    }
    await act(async () => { await Promise.resolve() })
    reply('ready', window)
    reply('rendered', window)
    expect(screen.getByRole('button', { name: '适应窗口' })).toBeDisabled()
    reply('ready')
    reply('rendered', frame.contentWindow, '错误实例')
    expect(screen.getByRole('button', { name: '适应窗口' })).toBeDisabled()
    reply('rendered')
    expect(screen.getByRole('button', { name: '适应窗口' })).toBeEnabled()
    reply('error')
    expect(screen.getByRole('alert')).toHaveTextContent('渲染失败')
    fireEvent.click(screen.getByRole('button', { name: '重新加载图形' }))
    await waitFor(() => expect(screen.getByTitle('架构 draw.io 画布')).not.toBe(frame))
    reply('rendered')
    expect(screen.getByRole('button', { name: '适应窗口' })).toBeDisabled()
  })

  it('页面与全屏切换复用各自阅读位置，旧画布回执不能覆盖新页面', async () => {
    render(<DrawioPreview content={`<mxfile><diagram name="主线">${model}</diagram><diagram name="细节">${model}</diagram></mxfile>`} name="架构" />)
    const reply = (frame: HTMLIFrameElement, state: string, view?: object) => {
      const token = frame.srcdoc.match(/var token='([^']+)'/)![1]
      fireEvent(window, new MessageEvent('message', { origin: 'null', source: frame.contentWindow, data: { type: 'forge-drawio', token, state, view } }))
    }
    const frame = await screen.findByTitle('架构 draw.io 画布') as HTMLIFrameElement
    await screen.findByRole('option', { name: '1/2 · 主线' })
    reply(frame, 'ready'); reply(frame, 'rendered')
    const position = { scale: 1.2, x: 800, y: 400, overview: false }
    reply(frame, 'viewport', position)
    fireEvent.click(screen.getByRole('button', { name: '全屏图形' }))
    const full = screen.getByTitle('架构 draw.io 画布') as HTMLIFrameElement
    const post = vi.spyOn(full.contentWindow!, 'postMessage')
    reply(full, 'ready')
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ action: 'load', view: position }), '*'))
    reply(full, 'rendered')
    fireEvent.change(screen.getByRole('combobox', { name: '图形页面' }), { target: { value: '1' } })
    const second = screen.getByTitle('架构 draw.io 画布') as HTMLIFrameElement
    expect(second).not.toBe(full)
    reply(full, 'viewport', { ...position, scale: 7 })
    reply(second, 'ready'); reply(second, 'rendered')
    fireEvent.change(screen.getByRole('combobox', { name: '图形页面' }), { target: { value: '0' } })
    const back = screen.getByTitle('架构 draw.io 画布') as HTMLIFrameElement
    const reload = vi.spyOn(back.contentWindow!, 'postMessage')
    reply(back, 'ready')
    await waitFor(() => expect(reload).toHaveBeenCalledWith(expect.objectContaining({ view: position }), '*'))
    reply(back, 'exit')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: '全屏图形' })).toHaveFocus()
  })
})

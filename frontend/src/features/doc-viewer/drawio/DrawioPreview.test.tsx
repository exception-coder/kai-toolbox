import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
    expect(screen.getByRole('button', { name: '放大图形' })).toBeDisabled()
    reply('ready')
    reply('rendered', frame.contentWindow, '错误实例')
    expect(screen.getByRole('button', { name: '放大图形' })).toBeDisabled()
    reply('rendered')
    expect(screen.getByRole('button', { name: '放大图形' })).toBeEnabled()
    reply('error')
    expect(screen.getByRole('alert')).toHaveTextContent('渲染失败')
    fireEvent.click(screen.getByRole('button', { name: '重新加载图形' }))
    await waitFor(() => expect(screen.getByTitle('架构 draw.io 画布')).not.toBe(frame))
    reply('rendered')
    expect(screen.getByRole('button', { name: '放大图形' })).toBeDisabled()
  })
})

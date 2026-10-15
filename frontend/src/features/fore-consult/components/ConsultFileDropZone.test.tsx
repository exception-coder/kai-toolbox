import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultFileDropZone } from './ConsultFileDropZone'

afterEach(cleanup)
const attachment = new File(['采购内容'], '采购说明.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
const transfer = (files = [attachment]) => ({ types: ['Files'], files, items: [], dropEffect: 'none' })

it('accepts files from anywhere inside the conversation exactly once and preserves nested drag highlight', () => {
  const onFiles = vi.fn()
  render(<ConsultFileDropZone data-testid="zone" onFiles={onFiles}><div data-testid="message">历史消息</div><textarea aria-label="草稿" defaultValue="原草稿" /></ConsultFileDropZone>)
  const zone = screen.getByTestId('zone'), child = screen.getByTestId('message'), dataTransfer = transfer()
  fireEvent.dragEnter(zone, { dataTransfer })
  fireEvent.dragEnter(child, { dataTransfer })
  fireEvent.dragLeave(child, { dataTransfer })
  expect(screen.getByRole('status')).toHaveTextContent('松开即可添加')
  const event = createEvent.drop(child, { dataTransfer })
  fireEvent(child, event)
  expect(event.defaultPrevented).toBe(true)
  expect(onFiles).toHaveBeenCalledExactlyOnceWith([attachment])
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveValue('原草稿')
})

it('blocks file navigation while unavailable or dropped outside, leaving text drops unchanged', () => {
  const onFiles = vi.fn()
  render(<ConsultFileDropZone data-testid="zone" onFiles={onFiles} dropDisabled><textarea aria-label="草稿" /></ConsultFileDropZone>)
  const zone = screen.getByTestId('zone')
  fireEvent.drop(zone, { dataTransfer: transfer() })
  expect(onFiles).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('等待会话恢复')
  const outside = createEvent.drop(window, { dataTransfer: transfer() })
  fireEvent(window, outside)
  expect(outside.defaultPrevented).toBe(true)
  const text = createEvent.drop(zone, { dataTransfer: { types: ['text/plain'], files: [] } })
  fireEvent(zone, text)
  expect(text.defaultPrevented).toBe(false)
})

it('rejects directories and reports an attachment failure without losing content', async () => {
  const onFiles = vi.fn().mockRejectedValue(new Error('网络断开'))
  render(<ConsultFileDropZone data-testid="zone" onFiles={onFiles}><p>原咨询</p></ConsultFileDropZone>)
  const zone = screen.getByTestId('zone')
  fireEvent.drop(zone, { dataTransfer: { ...transfer(), items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] } })
  expect(screen.getByRole('alert')).toHaveTextContent('文件夹')
  expect(onFiles).not.toHaveBeenCalled()
  fireEvent.drop(zone, { dataTransfer: transfer() })
  expect(await screen.findByRole('alert')).toHaveTextContent('原咨询内容已保留')
  expect(screen.getByText('原咨询')).toBeInTheDocument()
})

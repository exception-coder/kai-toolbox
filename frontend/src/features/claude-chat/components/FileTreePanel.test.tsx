import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileTreePanel } from './FileTreePanel'
import { listSessionFiles, readSessionFile } from '../api'

vi.mock('../api', () => ({ listSessionFiles: vi.fn(), readSessionFile: vi.fn(), revealSessionFile: vi.fn() }))
afterEach(cleanup)

describe('工作目录 draw.io 预览', () => {
  it.each([false, true])('完整文本走公共渲染器，截断文件明确拒绝渲染：truncated=%s', async truncated => {
    vi.mocked(listSessionFiles).mockResolvedValue([{ name: '架构.drawio', path: '架构.drawio', abs: 'D:/项目/架构.drawio', dir: false, size: 100, mtime: 1 }])
    vi.mocked(readSessionFile).mockResolvedValue({ name: '架构.drawio', path: '架构.drawio', size: 100, binary: false, truncated, content: '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>' })
    render(<FileTreePanel sessionId="fixture" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /架构.drawio/ }))
    if (truncated) {
      expect(await screen.findByRole('alert')).toHaveTextContent('文件读取结果已截断')
      expect(screen.queryByTitle('架构.drawio draw.io 画布')).toBeNull()
    } else {
      expect(await screen.findByTitle('架构.drawio draw.io 画布')).toHaveAttribute('sandbox', 'allow-scripts')
    }
  })
})

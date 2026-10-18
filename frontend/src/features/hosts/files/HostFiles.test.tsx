import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HostFiles } from './HostFiles'
import { listFiles, readFile, uploadFile } from './api'
import type { HostView } from '../types'
vi.mock('./api', () => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  uploadFile: vi.fn(),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listFiles).mockResolvedValue({
    path: '/erp',
    truncated: false,
    entries: [
      { name: 'app.txt', directory: false, link: false, size: 3, modified: 0 },
    ],
  })
  vi.mocked(readFile).mockResolvedValue({
    blob: new Blob(['old']),
    sha256: 'old-digest',
  })
  vi.mocked(uploadFile).mockResolvedValue({
    path: '/erp/app.txt',
    backup: '/erp/app.txt.forge-backup-123',
    sha256: 'new-digest',
  })
})
function open() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HostFiles
        host={
          {
            id: 'erp',
            name: 'ERP',
            username: 'user',
            host: 'example.test',
            port: 2322,
          } as HostView
        }
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  )
}
async function prepare() {
  fireEvent.click(await screen.findByText('准备替换'))
  await screen.findByText('替换已核对的远端文件')
}
it('only sends an overwrite digest after preparing the selected remote file', async () => {
  open()
  await screen.findByText('准备替换')
  fireEvent.change(screen.getByLabelText('本地文件'), {
    target: { files: [new File(['stale'], 'previous.txt')] },
  })
  await prepare()
  expect(screen.getByText('备份并替换')).toBeDisabled()
  const file = new File(['new'], 'local.txt')
  fireEvent.change(screen.getByLabelText('本地文件'), {
    target: { files: [file] },
  })
  fireEvent.click(screen.getByText('备份并替换'))
  await waitFor(() =>
    expect(uploadFile).toHaveBeenCalledWith(
      'erp',
      '/erp',
      'app.txt',
      file,
      'old-digest',
    ),
  )
  expect(await screen.findByText(/原文件备份/)).toBeTruthy()
})
it('does not carry an overwrite authorization into another directory', async () => {
  open()
  await prepare()
  fireEvent.change(screen.getByLabelText('远端目录'), {
    target: { value: '/other' },
  })
  fireEvent.click(screen.getByText('打开目录'))
  expect(await screen.findByText('上传新文件（不会覆盖同名文件）')).toBeTruthy()
  expect(screen.getByLabelText('远端文件名')).toHaveValue('')
})
it('keeps the selected target when a replacement fails', async () => {
  vi.mocked(uploadFile).mockRejectedValue(new Error('连接中断，请核对备份'))
  open()
  await prepare()
  fireEvent.change(screen.getByLabelText('本地文件'), {
    target: { files: [new File(['new'], 'local.txt')] },
  })
  fireEvent.click(screen.getByText('备份并替换'))
  expect(await screen.findByRole('alert')).toHaveTextContent('连接中断')
  expect(screen.getByLabelText('远端文件名')).toHaveValue('app.txt')
})

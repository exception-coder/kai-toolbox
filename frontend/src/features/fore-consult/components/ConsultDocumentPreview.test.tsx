import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultDocumentPreview } from './ConsultDocumentPreview'
import { http } from '@/lib/api'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
let client: QueryClient
const id = 'a'.repeat(64)
const preview = { mimeType: 'image/png', imageBase64: 'aGVsbG8=', kind: 'slides', notes: ['PPT文件实际渲染'], page: 1, totalPages: 5 }
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(http).mockResolvedValue(preview)
})
afterEach(() => { cleanup(); client.clear(); vi.clearAllMocks() })

async function mount() {
  const result = render(<QueryClientProvider client={client}><ConsultDocumentPreview sessionId="consult-a" id={id} name="采购汇报.pptx" /></QueryClientProvider>)
  expect(http).not.toHaveBeenCalled()
  await act(async () => { const details = result.container.querySelector('details')!; details.open = true; fireEvent(details, new Event('toggle')) })
  return result
}

it('loads only on expansion and pages through authenticated session-scoped previews', async () => {
  await mount()
  expect(await screen.findByAltText('采购汇报.pptx预览')).toHaveAttribute('src', 'data:image/png;base64,aGVsbG8=')
  expect(http).toHaveBeenCalledWith(`/fore-consult/sessions/consult-a/documents/${id}/preview?page=1`)
  fireEvent.click(screen.getByRole('button', { name: '下一组' }))
  await waitFor(() => expect(http).toHaveBeenCalledWith(`/fore-consult/sessions/consult-a/documents/${id}/preview?page=5`))
})

it('recovers from preview request failure and broken images without exposing browser broken icons', async () => {
  vi.mocked(http).mockRejectedValueOnce(new Error('forbidden'))
  await mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('已生成文件仍可下载')
  fireEvent.click(screen.getByRole('button', { name: '重新加载预览' }))
  const image = await screen.findByAltText('采购汇报.pptx预览')
  fireEvent.error(image)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toBeVisible()
})

it('labels structure previews honestly', async () => {
  vi.mocked(http).mockResolvedValueOnce({ ...preview, kind: 'structure', totalPages: 1 })
  await mount()
  expect(await screen.findByText('结构预览 · 最终排版请打开文件检查')).toBeVisible()
  expect(screen.queryByRole('button', { name: '下一组' })).not.toBeInTheDocument()
})

it('rejects non-image responses instead of rendering model-controlled URLs', async () => {
  vi.mocked(http).mockResolvedValueOnce({ ...preview, mimeType: 'text/html', imageBase64: '<script>bad()</script>' })
  await mount()
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

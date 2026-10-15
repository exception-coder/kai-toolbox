import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultDocuments } from './ConsultDocuments'
import { ConsultAnswerContent } from './ConsultPanel'
import { consultDocumentPath, downloadConsultDocument } from '../consultDocuments'
import { authFetch, http } from '@/lib/api'

vi.mock('@/lib/api', () => ({ http: vi.fn(), authFetch: vi.fn() }))
const path = `/api/fore-consult/sessions/consult-a/documents/${'a'.repeat(64)}/download`
const file = { id: 'a'.repeat(64), name: '业务确认表.xlsx', format: 'xlsx', bytes: 2048,
  storagePath: '.kai-toolbox/consult-artifacts/consult-a/file.xlsx', downloadUrl: path }
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(http).mockResolvedValue([file])
  vi.mocked(authFetch).mockResolvedValue(new Response('office-content', { headers: {
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  } }))
  URL.createObjectURL = vi.fn(() => 'blob:document')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.clearAllMocks() })

function mount(sessionId = 'consult-a') {
  return render(<QueryClientProvider client={client}><ConsultDocuments sessionId={sessionId} /></QueryClientProvider>)
}

it('shows persisted documents, controlled location and authenticated download', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: `下载 ${file.name}` }))
  await waitFor(() => expect(authFetch).toHaveBeenCalledWith(path.slice(4)))
  expect(screen.getByText(/服务端用户目录/)).toHaveTextContent(file.storagePath)
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
})

it('preserves a retry action on list failure and exposes download failure', async () => {
  vi.mocked(http).mockRejectedValueOnce(new Error('offline'))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: '重试' }))
  const button = await screen.findByRole('button', { name: `下载 ${file.name}` })
  vi.mocked(authFetch).mockResolvedValueOnce(new Response('', { status: 404 }))
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('文件不存在或你无权访问')
  expect(button).toBeEnabled()
})

it('does not occupy space for an empty session and keeps session queries isolated', async () => {
  vi.mocked(http).mockResolvedValue([])
  const { container } = mount('consult-b')
  await waitFor(() => expect(http).toHaveBeenCalledWith('/fore-consult/sessions/consult-b/documents'))
  expect(container).toBeEmptyDOMElement()
})

it('handles a generated Markdown link through the authenticated download path', async () => {
  render(<ConsultAnswerContent text="下载"><a href={path}>下载确认表</a></ConsultAnswerContent>)
  fireEvent.click(screen.getByRole('link', { name: '下载确认表' }))
  await waitFor(() => expect(authFetch).toHaveBeenCalledWith(path.slice(4)))
})

it('never sends authentication to foreign, malformed or traversal URLs', async () => {
  expect(consultDocumentPath(`https://evil.example${path}`)).toBeNull()
  expect(consultDocumentPath(`${path}?path=secret`)).toBeNull()
  expect(consultDocumentPath('/api/fore-consult/sessions/../secret')).toBeNull()
  await expect(downloadConsultDocument('https://evil.example/document')).rejects.toThrow('地址无效')
  expect(authFetch).not.toHaveBeenCalled()
})

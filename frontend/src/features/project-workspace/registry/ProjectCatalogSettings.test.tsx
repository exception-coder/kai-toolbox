import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectCatalogSettings } from './ProjectCatalogSettings'
import { listProjectCatalog, setProjectExcluded } from './projectCatalogApi'
vi.mock('./projectCatalogApi', () => ({ listProjectCatalog: vi.fn(), setProjectExcluded: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('uses the management inventory and retains an actionable failure', async () => {
  vi.mocked(listProjectCatalog).mockResolvedValue([{ id: 'a', systemId: '', name: 'ERP', path: '/work/erp', root: '/work', available: true, excluded: false, source: 'DISCOVERED' }])
  vi.mocked(setProjectExcluded).mockRejectedValue(new Error('保存失败'))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProjectCatalogSettings /></QueryClientProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '排除 ERP' }))
  await waitFor(() => expect(setProjectExcluded).toHaveBeenCalledWith('/work/erp', true))
  expect(await screen.findByText('保存失败')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  expect(listProjectCatalog).toHaveBeenCalledWith(true)
})

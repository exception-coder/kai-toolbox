import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { usePermission } from '@/shell/permission'
import { ProjectEnvironment } from './public-api'
import { LegacyEnvironmentRedirect } from './index'

vi.mock('@/shell/permission', () => ({ usePermission: vi.fn() }))
vi.mock('./pages/ForgeEnvironmentPage', () => ({ ForgeEnvironmentPage: ({ embedded }: { embedded: boolean }) => <p>{embedded ? '嵌入环境' : '独立环境'}</p> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('keeps the existing environment permission before mounting operations', () => {
  vi.mocked(usePermission).mockReturnValue(false)
  render(<ProjectEnvironment />)
  expect(screen.getByText('需要环境管理权限')).toBeInTheDocument()
  expect(screen.queryByText('嵌入环境')).not.toBeInTheDocument()
  expect(usePermission).toHaveBeenCalledWith('forge:environment:menu')
})

it('embeds existing operations for an authorized user', async () => {
  vi.mocked(usePermission).mockReturnValue(true)
  render(<ProjectEnvironment />)
  expect(await screen.findByText('嵌入环境')).toBeInTheDocument()
})

it('redirects the legacy entry and preserves context', () => {
  function Location() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p> }
  render(<MemoryRouter initialEntries={['/tools/forge-environment?projectId=erp#python']}><Routes>
    <Route path="/tools/forge-environment" element={<LegacyEnvironmentRedirect />} />
    <Route path="/tools/project-workspace" element={<Location />} />
  </Routes></MemoryRouter>)
  expect(screen.getByText('/tools/project-workspace?projectId=erp&section=environment#python')).toBeInTheDocument()
})

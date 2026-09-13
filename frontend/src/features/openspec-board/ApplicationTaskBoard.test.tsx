import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApplicationTaskBoard, LegacyOpenSpecRedirect } from './public-api'
import { usePermission } from '@/shell/permission'

vi.mock('@/shell/permission', () => ({ usePermission: vi.fn() }))
vi.mock('./pages/OpenSpecBoardPage', () => ({ OpenSpecBoardPage: ({ scopedProjectId }: { scopedProjectId: string }) => <p>当前工作区 {scopedProjectId}</p> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('retains permission before mounting task data', () => {
  vi.mocked(usePermission).mockReturnValue(false)
  render(<ApplicationTaskBoard projectId="one" />)
  expect(screen.getByText(/需要需求与任务查看权限/)).toBeInTheDocument()
  expect(screen.queryByText(/当前工作区/)).not.toBeInTheDocument()
})
it('passes the application workspace scope', async () => {
  vi.mocked(usePermission).mockReturnValue(true)
  render(<ApplicationTaskBoard projectId="one" />)
  expect(await screen.findByText('当前工作区 one')).toBeInTheDocument()
})
it('keeps legacy query and fragment under delivery center', () => {
  function Location() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p> }
  render(<MemoryRouter initialEntries={['/tools/openspec-board?projectId=p#task']}><Routes><Route path="/tools/openspec-board" element={<LegacyOpenSpecRedirect />} /><Route path="/tools/reqpool/changes" element={<Location />} /></Routes></MemoryRouter>)
  expect(screen.getByText('/tools/reqpool/changes?projectId=p#task')).toBeInTheDocument()
})

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProjectDevelopmentPage } from './ProjectDevelopmentPage'
import { LegacyDevelopmentRedirect } from './LegacyDevelopmentRedirect'
import { developmentLocation } from './navigation'

const context = vi.hoisted(() => ({ roles: ['ADMIN'], permissionCodes: [] as string[], superAdmin: false }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => context }))
vi.mock('./workbenches', () => ({ workbenches: [
  { id: 'erp-dev', name: 'ERP', permission: 'menu:erp-dev', component: () => <input aria-label="ERP 配置" defaultValue="" /> },
  { id: 'srm-dev', name: 'SRM', permission: 'menu:srm-dev', component: () => <p>SRM 服务控制</p> },
] }))
vi.mock('@/features/new-devmodule/public-api', () => ({ NewDevModulePage: () => <p>脚手架配置</p> }))

function CurrentLocation() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output> }
function mount(url = '/tools/project-development?system=erp-dev') {
  return render(<MemoryRouter initialEntries={[url]}><CurrentLocation /><Routes>
    <Route path="/tools/project-development" element={<ProjectDevelopmentPage />} />
    <Route path="/tools/erp-dev" element={<LegacyDevelopmentRedirect system="erp-dev" />} />
  </Routes></MemoryRouter>)
}
afterEach(() => { cleanup(); context.roles = ['ADMIN']; context.permissionCodes = [] })

describe('项目开发', () => {
  it('切换页签保留已填写配置', () => {
    mount()
    fireEvent.change(screen.getByLabelText('ERP 配置'), { target: { value: 'draft-host' } })
    fireEvent.click(screen.getByRole('tab', { name: 'SRM' }))
    expect(screen.getByText('SRM 服务控制')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'ERP' }))
    expect((screen.getByLabelText('ERP 配置') as HTMLInputElement).value).toBe('draft-host')
  })
  it('旧入口保留参数和定位片段', () => {
    mount('/tools/erp-dev?cwd=repo&tab=logs#service')
    expect(screen.getByTestId('location').textContent).toBe('/tools/project-development?cwd=repo&tab=logs&system=erp-dev#service')
  })
  it('有限权限仅挂载可用系统且隐藏新增', () => {
    context.roles = []; context.permissionCodes = ['menu:srm-dev']
    mount('/tools/project-development')
    expect(screen.queryByRole('tab', { name: 'ERP' })).toBeNull()
    expect(screen.queryByLabelText('ERP 配置')).toBeNull()
    expect(screen.getByText('SRM 服务控制')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '新增模块' })).toBeNull()
  })
  it('新增在页内打开并返回原系统', async () => {
    mount('/tools/project-development?system=srm-dev')
    fireEvent.click(screen.getByRole('button', { name: '新增模块' }))
    expect(await screen.findByText('脚手架配置')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }))
    expect(screen.getByRole('tab', { name: 'SRM' }).getAttribute('aria-selected')).toBe('true')
  })
  it('不通过 action 参数提升新增权限', () => {
    context.roles = []; context.permissionCodes = ['menu:erp-dev']
    mount('/tools/project-development?system=erp-dev&action=new')
    expect(screen.getByRole('alert').textContent).toContain('没有新增模块权限')
    expect(screen.queryByText('脚手架配置')).toBeNull()
  })
  it('方向键切换页签并移动焦点', () => {
    mount()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'ERP' }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'SRM' }))
    expect(screen.getByRole('tab', { name: 'SRM' }).getAttribute('aria-selected')).toBe('true')
  })
  it('未授权系统深链接提供恢复入口但不显示其内容', () => {
    context.roles = []; context.permissionCodes = ['menu:srm-dev']
    mount('/tools/project-development?system=erp-dev')
    expect(screen.queryByLabelText('ERP 配置')).toBeNull()
    expect(screen.getByText('该系统未登记或无权访问，请选择上方已授权的系统页签。')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'SRM' }))
    expect(screen.getByText('SRM 服务控制')).toBeTruthy()
  })
  it('切换系统清除新增动作并保留其他参数', () => {
    expect(developmentLocation('?action=new&cwd=repo', 'scm-dev').search).toBe('?cwd=repo&system=scm-dev')
  })
})

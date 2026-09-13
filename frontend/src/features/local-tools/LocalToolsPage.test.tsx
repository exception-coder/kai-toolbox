import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LocalToolsPage } from './LocalToolsPage'
import { LegacyLocalToolRedirect } from './LegacyLocalToolRedirect'
import { hasFeatureAccess } from '@/shell/access'
import { migrateVisibleMenus } from '@/shell/menuMigration'
import manifest from './index'

const state = vi.hoisted(() => ({ access: { roles: ['ADMIN'], permissionCodes: [] as string[], superAdmin: false }, mounts: 0, closes: 0 }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => state.access }))
vi.mock('./tools', () => ({ localTools: [
  { id: 'flatten', name: '目录扁平化', component: () => <input aria-label="目录" defaultValue="" /> },
  { id: 'port-process', name: '端口进程查询', component: () => <input aria-label="端口" defaultValue="" /> },
  { id: 'webterm', name: 'Web 终端', component: function TerminalProbe() {
    useEffect(() => { state.mounts++; return () => { state.closes++ } }, [])
    return <p>终端连接</p>
  } },
  { id: 'vscode-tunnel', name: 'VS Code Tunnel', component: () => <p>隧道状态</p> },
] }))

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="location">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>后退</button></>
}
function mount(url = '/tools/local-tools') {
  return render(<MemoryRouter initialEntries={[url]}><LocationProbe /><Routes>
    <Route path="/tools/local-tools" element={<LocalToolsPage />} />
    {['flatten', 'port-process', 'webterm', 'vscode-tunnel'].map(tool => <Route key={tool} path={`/tools/${tool}`} element={<LegacyLocalToolRedirect tool={tool} />} />)}
  </Routes></MemoryRouter>)
}
afterEach(() => { cleanup(); state.access.roles = ['ADMIN']; state.access.permissionCodes = []; state.mounts = 0; state.closes = 0 })

describe('本机工具工作区', () => {
  it('只初始化当前工具，切换及历史后退保留输入', () => {
    mount()
    fireEvent.change(screen.getByLabelText('目录'), { target: { value: 'D:/draft' } })
    expect(screen.queryByLabelText('端口')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '端口进程查询' }))
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '18080' } })
    fireEvent.click(screen.getByText('后退'))
    expect((screen.getByLabelText('目录') as HTMLInputElement).value).toBe('D:/draft')
    fireEvent.click(screen.getByRole('tab', { name: '端口进程查询' }))
    expect((screen.getByLabelText('端口') as HTMLInputElement).value).toBe('18080')
    expect(state.mounts).toBe(0)
  })
  it('终端只连接一次，切换不清理，离开模块才清理', () => {
    const view = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Web 终端' }))
    fireEvent.click(screen.getByRole('tab', { name: '目录扁平化' }))
    expect(state.closes).toBe(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Web 终端' }))
    expect(state.mounts).toBe(1)
    view.unmount()
    expect(state.closes).toBe(1)
  })
  it.each(['flatten', 'port-process', 'webterm', 'vscode-tunnel'])('旧入口 %s 保留参数和片段', tool => {
    mount(`/tools/${tool}?cwd=D%3A%2Frepo&autorun=claude#detail`)
    expect(screen.getByTestId('location').textContent).toBe(`/tools/local-tools?cwd=D%3A%2Frepo&autorun=claude&tool=${tool}#detail`)
  })
  it('有限授权只允许对应工具', () => {
    state.access.roles = []; state.access.permissionCodes = ['menu:port-process']
    mount()
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByLabelText('端口')).toBeTruthy()
    expect(screen.queryByLabelText('目录')).toBeNull()
    expect(state.mounts).toBe(0)
    expect(hasFeatureAccess({ ...manifest, requiredPermission: 'menu:local-tools' }, state.access)).toBe(true)
  })
  it('合并入口权限不授予子工具能力', () => {
    state.access.roles = []; state.access.permissionCodes = ['menu:local-tools']
    mount()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByRole('link', { name: '返回首页' })).toBeTruthy()
    expect(state.mounts).toBe(0)
  })
  it.each(['unknown', 'webterm'])('不可用目标 %s 可通过页签恢复', tool => {
    state.access.roles = []; state.access.permissionCodes = ['menu:port-process']
    mount(`/tools/local-tools?tool=${tool}`)
    expect(screen.getByText('该工具不存在或无权访问，请选择上方可用页签。')).toBeTruthy()
    expect(screen.queryByLabelText('端口')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '端口进程查询' }))
    expect(screen.getByLabelText('端口')).toBeTruthy()
    expect(state.mounts).toBe(0)
  })
  it('方向键只移动焦点，手动激活后才挂载', () => {
    mount()
    const first = screen.getByRole('tab', { name: '目录扁平化' })
    fireEvent.keyDown(first, { key: 'End' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'VS Code Tunnel' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Web 终端' }))
    expect(state.mounts).toBe(0)
    fireEvent.click(document.activeElement!)
    expect(state.mounts).toBe(1)
  })
  it('旧菜单偏好迁移后仍可主动隐藏', () => {
    expect(migrateVisibleMenus(['flatten', 'webterm', 'other'], [manifest])).toEqual(['other', 'local-tools'])
    expect(migrateVisibleMenus(['other'], [manifest])).toEqual(['other'])
  })
})

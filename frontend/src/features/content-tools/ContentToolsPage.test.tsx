import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ContentToolsPage } from './ContentToolsPage'
import { LegacyContentRedirect } from './LegacyContentRedirect'
import { contentToolLocation } from './navigation'

const access = vi.hoisted(() => ({ roles: [] as string[], permissionCodes: ['menu:content-tools'], superAdmin: false }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => access }))
vi.mock('./tools', () => ({ contentTools: [
  { id: 'formatter', name: '格式化工具', component: () => <input aria-label="格式化输入" /> },
  { id: 'qrcode', name: '二维码工具', component: ({ active }: { active: boolean }) => <p>二维码 {active ? 'active' : 'inactive'}</p> },
] }))
afterEach(() => { cleanup(); access.permissionCodes = ['menu:content-tools']; access.roles = []; access.superAdmin = false })
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}{location.hash}</output> }

describe('内容工具工作区', () => {
  it('切换保留输入，隐藏工具停止激活，键盘切换可用', () => {
    render(<MemoryRouter><ContentToolsPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('格式化输入'), { target: { value: '{"keep":true}' } })
    fireEvent.click(screen.getByRole('tab', { name: '二维码工具' }))
    expect(screen.getByText('二维码 active')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('tab', { name: '二维码工具' }), { key: 'Home' })
    expect((screen.getByLabelText('格式化输入') as HTMLInputElement).value).toBe('{"keep":true}')
    expect(screen.getByText('二维码 inactive').closest('section')?.hidden).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '格式化工具' }))
  })
  it('原菜单权限只挂载获授权工具', () => {
    access.permissionCodes = ['menu:formatter']
    render(<MemoryRouter initialEntries={['/tools/content-tools?tool=qrcode']}><ContentToolsPage /></MemoryRouter>)
    expect(screen.queryByRole('tab', { name: '二维码工具' })).toBeNull()
    expect(screen.queryByText('二维码 inactive')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('尚未授权')
  })
  it('无权限提供返回路径', () => {
    access.permissionCodes = []
    render(<MemoryRouter><ContentToolsPage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/')
    expect(screen.queryByLabelText('格式化输入')).toBeNull()
  })
  it('旧链接保留查询参数和片段', () => {
    render(<MemoryRouter initialEntries={['/tools/formatter?sample=one#input']}><LegacyContentRedirect tool="formatter" /><Location /></MemoryRouter>)
    expect(screen.getByRole('status').textContent).toBe('/tools/content-tools?sample=one&tool=formatter#input')
    expect(contentToolLocation('?tool=qrcode&sample=one', 'formatter').search).toBe('?tool=formatter&sample=one')
  })
})

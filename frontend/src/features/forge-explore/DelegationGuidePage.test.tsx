// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import DelegationGuidePage from './pages/DelegationGuidePage'
import { CodeSample } from './guide/CodeSample'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Delegation capability manual', () => {
  it('shows relay server configuration and a same-origin client without Forge secrets', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<MemoryRouter><DelegationGuidePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Spring Boot Starter' }))
    expect(screen.getByRole('figure', { name: 'Spring Boot 服务端中继架构图' })).toBeTruthy()
    expect(screen.getByLabelText('Starter Maven 依赖').textContent).toContain('forge-session-relay-spring-boot-starter')
    expect(screen.getByLabelText('业务 Spring Boot 配置').textContent).toContain('forge-base-url:')
    const code = screen.getByLabelText('Spring Boot 中继客户端').textContent!
    expect(code).toContain('/api/forge-session-relay/v1')
    expect(code).toContain('window.location.origin')
    expect(code).not.toContain('clientSecret')
    expect(code).not.toContain('getAccessToken')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('explains ownership and changes diagrams for business and risk decisions', () => {
    render(<MemoryRouter><DelegationGuidePage /></MemoryRouter>)
    expect(screen.getByRole('figure', { name: '委托能力架构图' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '业务与风险决策' }))
    const figure = screen.getByRole('figure', { name: '业务与风险决策时序图' })
    expect(within(figure).getByRole('heading', { name: '风险工具申请' })).toBeTruthy()
    expect(within(figure).getByText(/不是通用审批接口/)).toBeTruthy()
    expect(screen.queryByRole('figure', { name: '授权与连接时序图' })).toBeNull()
  })

  it('offers real participant entry and shows inert SDK examples without contacting a backend', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<MemoryRouter><DelegationGuidePage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '打开参与者页面' }).getAttribute('href')).toBe('/session-client')
    fireEvent.click(screen.getByRole('button', { name: 'SDK 接入' }))
    expect(screen.getByLabelText('connectParticipant.ts').textContent).toContain("from '@kai/session-client'")
    expect(screen.getByLabelText('exchangeInvitation.ts').textContent).toContain('/api/session-client/v1/invitations/exchange')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('copies exact code and keeps a manual recovery path when clipboard fails', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CodeSample title="接入示例" code="const example = 1" language="TypeScript" />)
    fireEvent.click(screen.getByRole('button', { name: '复制接入示例' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('代码已复制'))
    expect(writeText).toHaveBeenCalledWith('const example = 1')
    fireEvent.click(screen.getByRole('button', { name: '复制接入示例' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('手动复制'))
    expect(screen.getByLabelText('接入示例').textContent).toBe('const example = 1')
  })
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { FormatterPage } from './FormatterPage'

vi.mock('../components/JsonPanel', () => ({ JsonPanel: () => <input aria-label="JSON 原文" /> }))
vi.mock('../components/NginxPanel', () => ({ NginxPanel: () => <p>Nginx</p> }))
vi.mock('../components/XmlPanel', () => ({ XmlPanel: () => <p>XML</p> }))
vi.mock('../components/YamlPanel', () => ({ YamlPanel: () => <p>YAML</p> }))
vi.mock('../components/SqlPanel', () => ({ SqlPanel: () => <p>SQL</p> }))
vi.mock('../components/java/JavaCodePanel', () => ({ JavaCodePanel: () => <input aria-label="Java 原文" /> }))
afterEach(cleanup)
function Location() { const location = useLocation(); return <output aria-label="地址">{location.pathname}{location.search}{location.hash}</output> }

describe('格式化视图导航', () => {
  it('Java 深链接和格式切换保留原文、其他查询参数及片段', async () => {
    render(<MemoryRouter initialEntries={['/tools/content-tools?tool=formatter&format=java&sample=one#input']}><FormatterPage embedded /><Location /></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Java 原文'), { target: { value: 'void f(){}' } })
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('JSON 原文'), { target: { value: '{"keep":true}' } })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'JSON' }), { key: 'Home' })
    expect(screen.getByLabelText('Java 原文')).toHaveValue('void f(){}')
    expect(screen.getByLabelText('JSON 原文')).toHaveValue('{"keep":true}')
    expect(screen.getByLabelText('地址').textContent).toBe('/tools/content-tools?tool=formatter&format=java&sample=one#input')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Java 代码' }))
  })
  it('既有未指定格式的链接继续默认 JSON', () => {
    render(<MemoryRouter initialEntries={['/tools/content-tools?tool=formatter']}><FormatterPage embedded /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true')
  })
})

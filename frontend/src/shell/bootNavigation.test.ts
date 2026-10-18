import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const block = html.split('<!-- forge:boot-navigation:start -->')[1].split('<!-- forge:boot-navigation:end -->')[0]
const code = block.match(/<script>([\s\S]*?)<\/script>/)![1]

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('performance', { now: () => 25 })
  history.replaceState(null, '', '/')
  localStorage.clear()
  document.body.innerHTML = '<h1 id="boot-title">工作台</h1><p id="boot-description"></p><nav id="boot-navigation" hidden></nav><p id="boot-progress"></p>' + block.replace(/<script>[\s\S]*?<\/script>/, '')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ''; history.replaceState(null, '', '/') })

function login(roles: string[], permissions: string[] = []) {
  localStorage.setItem('toolbox.auth.token', 'test-only')
  localStorage.setItem('toolbox.auth.user', JSON.stringify({ userId: 1, roles }))
  localStorage.setItem('toolbox.auth.perms', JSON.stringify(permissions))
}
function entries() { return [...document.querySelectorAll<HTMLAnchorElement>('#boot-navigation a')] }

it('shows real manifest links before any application module or API has loaded', () => {
  login(['ADMIN'])
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  new Function(code)()
  expect(document.getElementById('boot-navigation')).toBeVisible()
  expect(entries().find(link => link.textContent === '业务系统咨询')?.getAttribute('href')).toBe('/tools/fore-consult')
  expect(entries().find(link => link.textContent === 'AI 交付中心')?.getAttribute('href')).toBe('/tools/reqpool/resources')
  expect(entries().some(link => link.textContent === '系统资源与测试账号')).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  expect(document.getElementById('boot-progress')).toHaveTextContent('菜单已可使用')
})

it('respects account permissions and a deliberately empty visible list', () => {
  login(['USER'], ['menu:fore-consult'])
  new Function(code)()
  expect(entries().map(link => link.textContent)).toEqual(['业务系统咨询'])
  document.getElementById('boot-navigation')!.replaceChildren()
  localStorage.setItem('kai-toolbox:menu-visible-ids', '[]')
  new Function(code)()
  expect(entries()).toHaveLength(0)
})

it('reuses merged-menu visibility and alternate control permissions', () => {
  login(['USER'], ['menu:formatter', 'menu:ai-chat'])
  localStorage.setItem('kai-toolbox:menu-visible-ids', '["formatter","claude-chat"]')
  new Function(code)()
  expect(entries().map(link => link.textContent)).toEqual(['Vibe Coding', '内容工具'])
})

it.each(['missing', 'corrupt', 'blocked'])('does not expose protected entries with %s login storage', scenario => {
  if (scenario === 'corrupt') localStorage.setItem('toolbox.auth.user', '{bad')
  if (scenario === 'blocked') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
  new Function(code)()
  expect(entries()).toHaveLength(0)
  expect(document.getElementById('boot-navigation')).not.toBeVisible()
})

it('offers cached navigation on direct tool routes without loading the application', () => {
  login(['ADMIN'])
  history.replaceState(null, '', '/tools/fore-consult')
  new Function(code)()
  expect(entries().some(link => link.textContent === '业务系统咨询')).toBe(true)
  expect(document.getElementById('boot-title')).toHaveTextContent('业务系统咨询')
})

it('includes a usable static skeleton and home recovery even without JavaScript or a login snapshot', () => {
  const page = new DOMParser().parseFromString(html, 'text/html')
  expect(page.querySelector('#boot-placeholder[aria-busy="true"]')).not.toBeNull()
  expect(page.querySelectorAll('#boot-placeholder .boot-skeleton-row')).toHaveLength(6)
  expect(page.querySelector<HTMLAnchorElement>('.boot-home')?.getAttribute('href')).toBe('/')
})

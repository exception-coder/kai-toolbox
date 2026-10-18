import { Suspense } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { preloadable } from '@/lib/preloadable'
import { FeatureLink } from './FeatureLink'
import type { FeatureManifest } from './types'

vi.mock('./featureRegistry', () => ({ entryOf: (feature: FeatureManifest) => feature.entry ?? feature.routes[0].path }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'connection') })

function fixture() {
  let mounts = 0
  const load = vi.fn(async () => ({ default: () => { mounts++; return <p>已加载页面</p> } }))
  const Page = preloadable(load)
  const details = vi.fn(async () => ({ default: () => null }))
  const Detail = preloadable(details)
  const feature: FeatureManifest = { id: 'example', name: '示例菜单', icon: () => null, entry: '/example', routes: [
    { path: '/example', element: <section><Page /></section> },
    { path: '/example/:id', element: <Detail /> },
  ] }
  const view = render(<MemoryRouter><FeatureLink feature={feature}>示例菜单</FeatureLink></MemoryRouter>)
  return { load, details, Page, view, mounts: () => mounts, link: screen.getByRole('link') }
}

it('preloads the wrapped entry on focus/touch, sharing the request with lazy rendering without mounting early', async () => {
  const { link, load, details, mounts, Page, view } = fixture()
  await act(async () => { fireEvent.focus(link); fireEvent.touchStart(link) })
  expect(load).toHaveBeenCalledOnce()
  expect(details).not.toHaveBeenCalled()
  expect(mounts()).toBe(0)
  view.rerender(<Suspense fallback="等待"><Page /></Suspense>)
  expect(await screen.findByText('已加载页面')).toBeVisible()
  expect(load).toHaveBeenCalledOnce()
})

it('waits for hover intent, canceling when the pointer leaves or the link unmounts', async () => {
  vi.useFakeTimers()
  const { link, load, view } = fixture()
  fireEvent.pointerEnter(link, { pointerType: 'mouse' })
  fireEvent.pointerLeave(link)
  await act(async () => vi.advanceTimersByTimeAsync(150))
  expect(load).not.toHaveBeenCalled()
  fireEvent.pointerEnter(link, { pointerType: 'mouse' })
  await act(async () => vi.advanceTimersByTimeAsync(120))
  expect(load).toHaveBeenCalledOnce()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([{ saveData: true }, { effectiveType: '2g' }])('skips speculative downloads on a restricted connection: %j', async connection => {
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection })
  const { link, load } = fixture()
  await act(async () => fireEvent.focus(link))
  expect(load).not.toHaveBeenCalled()
  expect(link).toHaveAttribute('href', '/example')
})

it('allows a fresh lazy load after speculative download failure', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => <p>重试成功</p> })
  const Page = preloadable(load)
  await expect(Page.preload()).rejects.toThrow('offline')
  render(<Suspense fallback="等待"><Page /></Suspense>)
  expect(await screen.findByText('重试成功')).toBeVisible()
  expect(load).toHaveBeenCalledTimes(2)
})

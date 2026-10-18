import { Suspense, lazy } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { WorkspaceRouter } from './WorkspaceRouter'

afterEach(() => { cleanup(); history.replaceState(null, '', '/') })

function Layout() {
  const { pathname } = useLocation()
  return <>
    <nav><NavLink to="/slow">慢页面</NavLink><NavLink to="/other">其他页面</NavLink></nav>
    <output data-testid="location">{pathname}</output>
    <Suspense fallback={<PageSkeleton title="目标页面" />}><Outlet /></Suspense>
  </>
}

it('commits location and active menu before a suspended page completes, and lets users leave it', async () => {
  let finish!: (module: { default: () => React.ReactNode }) => void
  const Slow = lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve }))
  history.replaceState(null, '', '/start')
  render(<WorkspaceRouter><Routes><Route element={<Layout />}>
    <Route path="/start" element={<p>原页面</p>} />
    <Route path="/slow" element={<Slow />} />
    <Route path="/other" element={<p>已切到其他页面</p>} />
  </Route></Routes></WorkspaceRouter>)
  fireEvent.click(screen.getByRole('link', { name: '慢页面' }))
  expect(location.pathname).toBe('/slow')
  expect(screen.getByTestId('location')).toHaveTextContent('/slow')
  expect(screen.getByRole('link', { name: '慢页面' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('region', { name: '目标页面加载中' })).toBeVisible()
  fireEvent.click(screen.getByRole('link', { name: '其他页面' }))
  expect(screen.getByText('已切到其他页面')).toBeVisible()
  await act(async () => finish({ default: () => <p>较晚完成的旧请求</p> }))
  expect(screen.getByTestId('location')).toHaveTextContent('/other')
  expect(screen.queryByText('较晚完成的旧请求')).not.toBeInTheDocument()
})

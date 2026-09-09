import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import manifest from './index'

afterEach(cleanup)

it('redirects legacy project management to the local registry section without a duplicate menu', () => {
  function Destination() { return <p>{useLocation().search}</p> }
  render(<MemoryRouter initialEntries={['/tools/projects']}><Routes>
    <Route path="/tools/projects" element={manifest.routes[0].element} />
    <Route path="/tools/project-workspace" element={<Destination />} />
  </Routes></MemoryRouter>)
  expect(screen.getByText('?section=local')).toBeInTheDocument()
  expect(manifest.chrome).toBe(true)
})

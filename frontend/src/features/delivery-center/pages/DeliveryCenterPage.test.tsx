import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, it, expect } from 'vitest'
import { DeliveryCenterPage } from './DeliveryCenterPage'
afterEach(cleanup)

describe('legacy delivery redirect', () => {
  it('preserves legacy search and hash through redirect', () => {
    function Destination() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p> }
    render(<MemoryRouter initialEntries={['/tools/delivery-center?project=ERP#evidence']}><Routes>
      <Route path="/tools/delivery-center" element={<DeliveryCenterPage />} /><Route path="/tools/reqpool" element={<Destination />} />
    </Routes></MemoryRouter>)
    expect(screen.getByText('/tools/reqpool?project=ERP#evidence')).toBeTruthy()
  })
})

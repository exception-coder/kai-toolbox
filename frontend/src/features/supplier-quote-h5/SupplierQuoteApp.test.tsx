import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupplierQuoteApp } from './SupplierQuoteApp'
import type { QuotationAccess, RegistrationInvitation, SupplierQuoteGateway } from './api/contract'

const pendingGateway: SupplierQuoteGateway = {
  getWechatSession: vi.fn(async () => ({
    authenticated: true,
    bound: true,
    authorizeUrl: null,
    binding: {
      scmUserId: 'scm-demo-001', username: 'supplier-demo', displayName: '王经理',
      supplierId: 'supplier-demo-001', supplierName: '广州睿程服饰有限公司',
    },
  })),
  bindScmAccount: vi.fn(),
  getRegistrationInvitation: vi.fn(() => new Promise<RegistrationInvitation>(() => undefined)),
  sendVerificationCode: vi.fn(),
  registerWithInvitation: vi.fn(),
  getQuotationAccess: vi.fn(() => new Promise<QuotationAccess>(() => undefined)),
  saveDraft: vi.fn(),
  submitQuotation: vi.fn(),
}

afterEach(cleanup)

describe('SupplierQuoteApp routes', () => {
  it('matches the quotation entry when mounted below the Forge showcase route', async () => {
    render(
      <MemoryRouter initialEntries={['/showcase/supplier-quote/q/demo-quote']}>
        <Routes>
          <Route
            path="/showcase/supplier-quote/*"
            element={
              <SupplierQuoteApp
                gateway={pendingGateway}
                routeBase="/showcase/supplier-quote"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '供应商报价单' })).toBeInTheDocument()
    expect(screen.queryByText('没有找到对应的报价或登记入口')).not.toBeInTheDocument()
  })

  it('keeps matching the standalone quotation entry at the domain root', async () => {
    render(
      <MemoryRouter initialEntries={['/q/demo-quote']}>
        <SupplierQuoteApp gateway={pendingGateway} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '供应商报价单' })).toBeInTheDocument()
  })
})

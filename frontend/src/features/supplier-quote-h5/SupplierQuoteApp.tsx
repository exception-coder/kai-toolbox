import { useCallback } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { H5Frame } from './components/H5Frame'
import { StatePanel } from './components/StatePanel'
import { WechatSessionBoundary } from './components/WechatSessionBoundary'
import { InvitationRegistrationPage } from './pages/InvitationRegistrationPage'
import { ScmAccountBindingPage } from './pages/ScmAccountBindingPage'
import { SupplierQuotationPage } from './pages/SupplierQuotationPage'
import type { SupplierQuoteGateway } from './api/contract'
import './supplier-quote.css'

export interface SupplierQuoteAppProps {
  gateway: SupplierQuoteGateway
  routeBase?: string
  brandName?: string
  demo?: boolean
}

export function SupplierQuoteApp({ gateway, routeBase = '', brandName = '织联协同', demo = false }: SupplierQuoteAppProps) {
  const normalizedBase = routeBase.replace(/\/$/, '')
  const buildPath = useCallback(
    (path: string) => `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`,
    [normalizedBase],
  )
  return (
    <Routes>
      <Route path="register/:inviteTicket" element={<InvitationRegistrationPage gateway={gateway} brandName={brandName} demo={demo} buildPath={buildPath} />} />
      <Route path="bind-scm" element={<ScmAccountBindingPage gateway={gateway} brandName={brandName} demo={demo} buildPath={buildPath} />} />
      <Route path="q/:quoteTicket" element={
        <WechatSessionBoundary gateway={gateway} brandName={brandName} buildPath={buildPath}>
          <SupplierQuotationPage gateway={gateway} brandName={brandName} buildPath={buildPath} />
        </WechatSessionBoundary>
      } />
      <Route index element={<Navigate replace to={buildPath('/q/demo-quote')} />} />
      <Route path="*" element={<NotFoundFallback brandName={brandName} demoPath={buildPath('/q/demo-quote')} />} />
    </Routes>
  )
}

function NotFoundFallback({ brandName, demoPath }: { brandName: string; demoPath: string }) {
  const navigate = useNavigate()
  return (
    <H5Frame brandName={brandName} currentStep={1} title="页面地址无效" description="请从采购方发送的专属邀请或报价通知重新进入。">
      <StatePanel
        tone="warning"
        contextTag="路由错误"
        title="没有找到对应的报价或登记入口"
        description="当前访问的链接地址格式不正确，或专属凭证参数已丢失。"
        metaTrace="错误代码: ROUTE_NOT_FOUND (404)"
        action={{
          label: '返回演示报价页',
          onClick: () => navigate(demoPath),
        }}
        secondaryAction={{
          label: '返回系统首页',
          onClick: () => navigate('/'),
        }}
      />
    </H5Frame>
  )
}

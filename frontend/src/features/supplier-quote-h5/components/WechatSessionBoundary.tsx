import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SupplierQuoteGateway } from '../api/contract'
import { asGatewayError } from '../api/contract'
import { H5Frame } from './H5Frame'
import { StatePanel } from './StatePanel'

interface WechatSessionBoundaryProps {
  gateway: SupplierQuoteGateway
  brandName: string
  buildPath: (path: string) => string
  children: ReactNode
}

export function WechatSessionBoundary(props: WechatSessionBoundaryProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null })
  const returnTo = `${location.pathname}${location.search}`

  useEffect(() => {
    const controller = new AbortController()
    const watchdog = globalThis.setTimeout(() => {
      controller.abort()
      setState({ ready: false, error: '报价服务响应超时，请确认 Forge 后端已启动' })
    }, 9_000)
    props.gateway.getWechatSession(returnTo, controller.signal).then(session => {
      globalThis.clearTimeout(watchdog)
      if (!session.authenticated) {
        if (!session.authorizeUrl) throw new Error('授权入口缺失')
        window.location.assign(session.authorizeUrl)
        return
      }
      if (!session.bound) {
        navigate(`${props.buildPath('/bind-scm')}?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
        return
      }
      setState({ ready: true, error: null })
    }).catch(error => {
      globalThis.clearTimeout(watchdog)
      const normalized = asGatewayError(error)
      if (normalized.errorCode !== 'REQUEST_ABORTED') setState({ ready: false, error: normalized.message })
    })
    return () => {
      globalThis.clearTimeout(watchdog)
      controller.abort()
    }
  }, [props.gateway, returnTo])

  if (state.ready) return props.children
  return (
    <H5Frame brandName={props.brandName} currentStep={1} title="正在确认微信身份" description="首次进入将自动完成公众号静默授权。">
      <StatePanel
        tone={state.error ? 'error' : 'loading'}
        contextTag={state.error ? '授权异常' : '微信授权'}
        title={state.error ? '暂时无法确认微信身份' : '正在识别当前微信账号'}
        description={state.error ?? '授权完成后会自动返回当前报价单，无需手工操作。'}
        action={state.error ? { label: '重新尝试', onClick: () => window.location.reload() } : undefined}
      />
    </H5Frame>
  )
}

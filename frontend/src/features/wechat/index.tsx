import { lazy } from 'react'
import { MessageCircle } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const WechatPage = lazy(() => import('./pages/WechatPage').then((m) => ({ default: m.WechatPage })))

const manifest: FeatureManifest = {
  id: 'wechat',
  name: '微信监控',
  icon: MessageCircle,
  group: '效率工具',
  description: '读微信消息、监听新消息实时推送、发文字。基于 wxauto sidecar，人在外面也能看 PC 微信',
  order: 35,
  routes: [{ path: '/tools/wechat', element: <WechatPage /> }],
}

export default manifest

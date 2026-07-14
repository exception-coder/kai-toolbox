import { lazy } from 'react'
import { Mail } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const MailInboxPage = lazy(() => import('./pages/MailInboxPage').then((m) => ({ default: m.MailInboxPage })))
const manifest: FeatureManifest = {
  id: 'mail',
  name: '收件箱',
  icon: Mail,
  group: '网络',
  description: '内嵌 SMTP 服务器，统一接收各电商店铺验证邮件',
  order: 30,
  routes: [{ path: '/tools/mail', element: <MailInboxPage /> }],
}

export default manifest

import { lazy } from 'react'
import { BadgeCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const WelfareSignPage = lazy(() => import('./pages/WelfareSignPage').then(m => ({ default: m.WelfareSignPage })))

const manifest: FeatureManifest = {
  id: 'welfare-sign',
  name: '福利签收',
  icon: BadgeCheck,
  group: '企业',
  description: '国央企节假日福利线上签名、白名单校验、记录查询与导出',
  order: 64,
  routes: [
    { path: '/tools/welfare-sign', element: <WelfareSignPage /> },
    { path: '/tools/welfare-sign/fullscreen', element: <WelfareSignPage fullscreen /> },
  ],
}

export default manifest

import { LegacyContentRedirect } from '@/features/content-tools/public-api'
import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'crypto',
  chrome: true,
  name: '加解密工具',
  icon: ShieldCheck,
  group: '内容',
  description: 'AES / RSA / Hash / Base64 / Token 在线加解密与安全随机串生成，纯前端运算不落盘',
  order: 40,
  routes: [{ path: '/tools/crypto', element: <LegacyContentRedirect tool="crypto" /> }],
}

export default manifest

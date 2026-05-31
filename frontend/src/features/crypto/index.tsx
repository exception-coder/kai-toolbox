import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { CryptoPage } from './pages/CryptoPage'

const manifest: FeatureManifest = {
  id: 'crypto',
  name: '加解密工具',
  icon: ShieldCheck,
  group: '内容工具',
  description: 'AES / RSA / Hash / Base64 / Token 在线加解密与安全随机串生成，纯前端运算不落盘',
  order: 40,
  routes: [{ path: '/tools/crypto', element: <CryptoPage /> }],
}

export default manifest

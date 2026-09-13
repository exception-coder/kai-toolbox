import { LegacyContentRedirect } from '@/features/content-tools/public-api'
import { QrCode } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'qrcode',
  chrome: true,
  name: '二维码工具',
  icon: QrCode,
  group: '内容',
  description: '识别图片二维码（粘贴 / 拖拽 / 上传）或把文本/链接转成二维码，纯前端运算不落盘',
  order: 45,
  routes: [{ path: '/tools/qrcode', element: <LegacyContentRedirect tool="qrcode" /> }],
}

export default manifest

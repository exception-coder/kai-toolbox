import { QrCode } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { QrcodePage } from './pages/QrcodePage'

const manifest: FeatureManifest = {
  id: 'qrcode',
  name: '二维码工具',
  icon: QrCode,
  group: '内容工具',
  description: '识别图片二维码（粘贴 / 拖拽 / 上传）或把文本/链接转成二维码，纯前端运算不落盘',
  order: 45,
  routes: [{ path: '/tools/qrcode', element: <QrcodePage /> }],
}

export default manifest

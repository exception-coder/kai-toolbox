import { lazy } from 'react'

export const contentTools = [
  { id: 'markdown-card', name: 'Markdown 转卡片', component: lazy(() => import('@/features/markdown-card/public-api').then(m => ({ default: m.MarkdownCardPage }))) },
  { id: 'image-mosaic', name: '图片打码', component: lazy(() => import('@/features/image-mosaic/public-api').then(m => ({ default: m.ImageMosaicPage }))) },
  { id: 'crypto', name: '加解密工具', component: lazy(() => import('@/features/crypto/public-api').then(m => ({ default: m.CryptoPage }))) },
  { id: 'qrcode', name: '二维码工具', component: lazy(() => import('@/features/qrcode/public-api').then(m => ({ default: m.QrcodePage }))) },
  { id: 'formatter', name: '格式化工具', component: lazy(() => import('@/features/formatter/public-api').then(m => ({ default: m.FormatterPage }))) },
]

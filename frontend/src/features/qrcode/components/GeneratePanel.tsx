import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Download, FileImage, FileType } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'

type Level = 'L' | 'M' | 'Q' | 'H'

const LEVEL_OPTIONS = [
  { value: 'L', label: 'L · 7%' },
  { value: 'M', label: 'M · 15%' },
  { value: 'Q', label: 'Q · 25%' },
  { value: 'H', label: 'H · 30%' },
] as const

const LEVEL_HINT: Record<Level, string> = {
  L: '低纠错 · 二维码点阵最稀疏，扫码速度最快',
  M: '中纠错 · 默认值，覆盖大多数场景',
  Q: '较高纠错 · 适合可能被遮挡或印刷质量一般的场景',
  H: '高纠错 · 可在中心叠加 logo，可承受 30% 区域损坏',
}

const SIZE_OPTIONS = [
  { value: '256', label: '256' },
  { value: '512', label: '512' },
  { value: '1024', label: '1024' },
] as const

export function GeneratePanel() {
  const [text, setText] = useState('')
  const [level, setLevel] = useState<Level>('M')
  const [size, setSize] = useState<'256' | '512' | '1024'>('512')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const trimmed = text.trim()
  const sizePx = Number(size)

  const getSvgString = (): string | null => {
    const svg = wrapRef.current?.querySelector('svg')
    if (!svg) return null
    // 兼容某些浏览器导出时缺 xmlns
    const clone = svg.cloneNode(true) as SVGElement
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return new XMLSerializer().serializeToString(clone)
  }

  const safeBaseName = (() => {
    if (!trimmed) return 'qrcode'
    // 优先取 URL host；否则用文本前 24 字符且去掉非法文件名字符
    try {
      const u = new URL(trimmed)
      return `qrcode-${u.hostname || 'text'}`
    } catch {
      return `qrcode-${trimmed.slice(0, 24).replace(/[\\/:*?"<>|\s]+/g, '_')}`
    }
  })()

  const downloadSvg = () => {
    const svgStr = getSvgString()
    if (!svgStr) return
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `${safeBaseName}.svg`)
  }

  const downloadPng = () => {
    const svgStr = getSvgString()
    if (!svgStr) return
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = sizePx
      canvas.height = sizePx
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(svgUrl)
        return
      }
      // 白底，避免某些查看器把透明背景渲染成黑色
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, sizePx, sizePx)
      ctx.drawImage(img, 0, 0, sizePx, sizePx)
      URL.revokeObjectURL(svgUrl)
      canvas.toBlob(blob => {
        if (blob) triggerDownload(blob, `${safeBaseName}.png`)
      }, 'image/png')
    }
    img.onerror = () => URL.revokeObjectURL(svgUrl)
    img.src = svgUrl
  }

  const canDownload = trimmed.length > 0

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">
          输入文本或链接
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="例如：https://example.com  或任意文本"
          className="block w-full min-h-[180px] resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-[var(--color-muted-foreground)]">纠错等级</label>
            <Segmented value={level} onChange={setLevel} options={LEVEL_OPTIONS} size="sm" />
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">{LEVEL_HINT[level]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--color-muted-foreground)]">导出尺寸</label>
          <Segmented value={size} onChange={setSize} options={SIZE_OPTIONS} size="sm" />
          <span className="text-xs text-[var(--color-muted-foreground)]">px · 仅影响下载的图片，不影响预览</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="lg" variant="default" className="shadow-md" onClick={downloadPng} disabled={!canDownload}>
            <Download />
            下载 PNG
          </Button>
          <Button size="lg" variant="outline" onClick={downloadSvg} disabled={!canDownload}>
            <FileType />
            下载 SVG
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div
          ref={wrapRef}
          className="flex aspect-square w-full items-center justify-center rounded-md border bg-white p-4 shadow-sm"
        >
          {canDownload ? (
            <QRCodeSVG value={trimmed} level={level} size={240} marginSize={1} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <FileImage className="h-6 w-6" />
              输入内容后预览
            </div>
          )}
        </div>
        <p className="text-center text-xs text-[var(--color-muted-foreground)]">
          预览基于 SVG 矢量渲染，扫码时以下载文件为准
        </p>
      </div>
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

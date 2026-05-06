import { forwardRef, useMemo } from 'react'
import { parseMarkdown } from '../lib/markdownPipeline'
import { getThemeAttr } from '../lib/themes'
import type { Theme, Watermark } from '../types'

interface XiaohongshuCardProps {
  text: string
  theme: Theme
  watermark: Watermark
}

export const XiaohongshuCard = forwardRef<HTMLDivElement, XiaohongshuCardProps>(
  ({ text, theme, watermark }, ref) => {
    const html = useMemo(() => parseMarkdown(text), [text])
    const showWatermark = !!(watermark.signature || watermark.subSignature || watermark.qrcodeUrl)

    return (
      <div ref={ref} {...getThemeAttr(theme)} className="md-card-xhs">
        <div
          className="md-card-content"
          dangerouslySetInnerHTML={{ __html: html || '<p><em>这里会显示卡片正文</em></p>' }}
        />
        {showWatermark && (
          <div className="md-card-xhs-watermark">
            <div className="md-card-xhs-signature-block">
              {watermark.signature && (
                <div className="md-card-xhs-signature">{watermark.signature}</div>
              )}
              {watermark.subSignature && (
                <div className="md-card-xhs-subsignature">{watermark.subSignature}</div>
              )}
            </div>
            {watermark.qrcodeUrl && (
              <img
                src={watermark.qrcodeUrl}
                alt="qrcode"
                className="md-card-xhs-qrcode"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        )}
      </div>
    )
  },
)
XiaohongshuCard.displayName = 'XiaohongshuCard'

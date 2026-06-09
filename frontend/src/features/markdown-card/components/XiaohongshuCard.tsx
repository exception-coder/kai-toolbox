import { forwardRef } from 'react'
import { getThemeAttr } from '../lib/themes'
import { RemovableContent } from './RemovableContent'
import type { Theme, Watermark } from '../types'

interface XiaohongshuCardProps {
  text: string
  theme: Theme
  watermark: Watermark
  removed: Set<string>
  onToggleBlock: (key: string) => void
}

export const XiaohongshuCard = forwardRef<HTMLDivElement, XiaohongshuCardProps>(
  ({ text, theme, watermark, removed, onToggleBlock }, ref) => {
    const showWatermark = !!(watermark.signature || watermark.subSignature || watermark.qrcodeUrl)

    return (
      <div ref={ref} {...getThemeAttr(theme)} className="md-card-xhs">
        {text.trim() ? (
          <RemovableContent text={text} scope="single" removed={removed} onToggle={onToggleBlock} />
        ) : (
          <div
            className="md-card-content"
            dangerouslySetInnerHTML={{ __html: '<p><em>这里会显示卡片正文</em></p>' }}
          />
        )}
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

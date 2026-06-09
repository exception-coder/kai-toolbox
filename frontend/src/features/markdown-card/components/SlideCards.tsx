import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { splitByHeading, splitSlides } from '../lib/markdownPipeline'
import { getThemeAttr } from '../lib/themes'
import { RemovableContent } from './RemovableContent'
import { SLIDE_RATIOS, type SlideRatio, type SplitMode, type Theme } from '../types'

export interface SlideCardsHandle {
  getSlideNodes: () => HTMLElement[]
  getCount: () => number
}

interface SlideCardsProps {
  text: string
  theme: Theme
  ratio: SlideRatio
  splitMode: SplitMode
  removed: Set<string>
  onToggleBlock: (key: string) => void
}

export const SlideCards = forwardRef<SlideCardsHandle, SlideCardsProps>(
  ({ text, theme, ratio, splitMode, removed, onToggleBlock }, ref) => {
    const slides = useMemo(() => {
      if (splitMode === 'h1') return splitByHeading(text, 1)
      if (splitMode === 'h1h2') return splitByHeading(text, 2)
      return splitSlides(text)
    }, [text, splitMode])
    const ratioConf = SLIDE_RATIOS.find(r => r.id === ratio) ?? SLIDE_RATIOS[0]
    const [active, setActive] = useState(0)
    const safeActive = Math.min(active, slides.length - 1)
    const slideRefs = useRef<HTMLDivElement[]>([])

    useImperativeHandle(
      ref,
      () => ({
        getSlideNodes: () =>
          slideRefs.current.filter((n): n is HTMLDivElement => !!n),
        getCount: () => slides.length,
      }),
      [slides.length],
    )

    const setSlideRef = (i: number) => (el: HTMLDivElement | null) => {
      if (el) slideRefs.current[i] = el
    }

    return (
      <div className="flex flex-col items-center gap-3">
        <ScaledStage w={ratioConf.w} h={ratioConf.h} maxWidth={720}>
          <SlideStage
            key={`${safeActive}-${ratio}-${theme}`}
            text={slides[safeActive] ?? ''}
            theme={theme}
            w={ratioConf.w}
            h={ratioConf.h}
            scope={`slide${safeActive}`}
            removed={removed}
            onToggleBlock={onToggleBlock}
          />
        </ScaledStage>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActive(i => Math.max(0, i - 1))}
            disabled={safeActive === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            上一张
          </Button>
          <span className="tabular-nums text-xs text-[var(--color-muted-foreground)]">
            第 {safeActive + 1} / {slides.length} 张
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActive(i => Math.min(slides.length - 1, i + 1))}
            disabled={safeActive >= slides.length - 1}
          >
            下一张
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 离屏：导出时抓取所有页的真实像素尺寸 DOM */}
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-99999px] top-0 opacity-0"
        >
          {slides.map((s, i) => (
            <div key={`offscreen-${i}-${ratio}-${theme}`} ref={setSlideRef(i)}>
              <SlideStage
                text={s}
                theme={theme}
                w={ratioConf.w}
                h={ratioConf.h}
                scope={`slide${i}`}
                removed={removed}
                onToggleBlock={onToggleBlock}
              />
            </div>
          ))}
        </div>
      </div>
    )
  },
)
SlideCards.displayName = 'SlideCards'

function ScaledStage({
  w,
  h,
  maxWidth,
  children,
}: {
  w: number
  h: number
  maxWidth: number
  children: React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const update = () => {
      const containerWidth = Math.min(wrap.clientWidth, maxWidth)
      setScale(containerWidth / w)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [w, maxWidth])

  return (
    <div ref={wrapRef} className="w-full" style={{ maxWidth }}>
      <div
        className="relative overflow-hidden rounded-lg border shadow-sm"
        style={{ width: w * scale, height: h * scale }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: w, height: h, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SlideStage({
  text,
  theme,
  w,
  h,
  scope,
  removed,
  onToggleBlock,
}: {
  text: string
  theme: Theme
  w: number
  h: number
  scope: string
  removed: Set<string>
  onToggleBlock: (key: string) => void
}) {
  return (
    <div
      {...getThemeAttr(theme)}
      className="md-card-slide"
      style={{ width: w, height: h }}
    >
      {text.trim() ? (
        <RemovableContent text={text} scope={scope} removed={removed} onToggle={onToggleBlock} />
      ) : (
        <div
          className="md-card-content"
          dangerouslySetInnerHTML={{ __html: '<p><em>这一页是空的</em></p>' }}
        />
      )}
    </div>
  )
}

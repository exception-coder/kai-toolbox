import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageMosaicCanvas } from '../components/ImageMosaicCanvas'

export function ImageMosaicPage({ embedded = false }: { embedded?: boolean; active?: boolean } = {}) {
  return (
    <div className={embedded ? "w-full space-y-4" : "mx-auto max-w-6xl space-y-4 p-6"}>
      <Card className={embedded ? "rounded-none border-0 bg-transparent shadow-none" : undefined}>
        <CardHeader className={embedded ? "px-0 pt-0 pb-4" : undefined}>
          <CardTitle className={embedded ? "sr-only" : undefined}>图片打码</CardTitle>
          <CardDescription>
            选择图片后用鼠标拖出矩形框选区域，支持像素化 / 高斯模糊 / 黑条三种打码方式。整个流程纯前端 Canvas 实现，图片不会离开本机。
          </CardDescription>
        </CardHeader>
        <CardContent className={embedded ? "p-0" : undefined}>
          <ImageMosaicCanvas />
        </CardContent>
      </Card>
    </div>
  )
}

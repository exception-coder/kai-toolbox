import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageMosaicCanvas } from '../components/ImageMosaicCanvas'

export function ImageMosaicPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>图片打码</CardTitle>
          <CardDescription>
            选择图片后用鼠标拖出矩形框选区域，支持像素化 / 高斯模糊 / 黑条三种打码方式。整个流程纯前端 Canvas 实现，图片不会离开本机。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImageMosaicCanvas />
        </CardContent>
      </Card>
    </div>
  )
}

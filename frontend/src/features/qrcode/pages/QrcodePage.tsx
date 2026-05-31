import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { DecodePanel } from '../components/DecodePanel'
import { GeneratePanel } from '../components/GeneratePanel'

type Tab = 'decode' | 'generate'

const TAB_OPTIONS = [
  { value: 'decode', label: '识别二维码' },
  { value: 'generate', label: '生成二维码' },
] as const

const TAB_HINTS: Record<Tab, string> = {
  decode: '支持粘贴、拖拽、点击上传三种方式；自动判断结果是不是 URL',
  generate: '文本 / 链接转二维码，支持 PNG / SVG 下载与纠错等级调节',
}

export function QrcodePage() {
  const [tab, setTab] = useState<Tab>('decode')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>二维码工具</CardTitle>
            <CardDescription>纯前端运算，图片与文本均不会上送服务端</CardDescription>
          </div>
          <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} size="md" />
          <p className="text-xs text-[var(--color-muted-foreground)]">{TAB_HINTS[tab]}</p>
        </CardHeader>
        <CardContent>
          {tab === 'decode' && <DecodePanel />}
          {tab === 'generate' && <GeneratePanel />}
        </CardContent>
      </Card>
    </div>
  )
}

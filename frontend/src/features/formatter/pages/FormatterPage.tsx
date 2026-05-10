import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { JsonPanel } from '../components/JsonPanel'
import { NginxPanel } from '../components/NginxPanel'

type Tab = 'json' | 'nginx'

const TAB_OPTIONS = [
  { value: 'json', label: 'JSON' },
  { value: 'nginx', label: 'Nginx' },
] as const

const TAB_HINTS: Record<Tab, string> = {
  json: '美化 / 压缩 / 转义反转义；解析失败会标出错误位置',
  nginx: '基于 token 的简易格式化器，支持缩进 + 压缩，注释 / 引号字符串保留',
}

export function FormatterPage() {
  const [tab, setTab] = useState<Tab>('json')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>格式化工具</CardTitle>
            <CardDescription>纯前端运算，输入数据不会上送服务端</CardDescription>
          </div>
          <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} size="md" />
          <p className="text-xs text-[var(--color-muted-foreground)]">{TAB_HINTS[tab]}</p>
        </CardHeader>
        <CardContent>
          {tab === 'json' && <JsonPanel />}
          {tab === 'nginx' && <NginxPanel />}
        </CardContent>
      </Card>
    </div>
  )
}

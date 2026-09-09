import { Button } from '@/components/ui/button'

export function WorkspaceState({ error, retry }: { error?: Error | null; retry?: () => void }) {
  return <div className="py-8" role={error ? 'alert' : 'status'}>
    <h3 className="font-medium">{error ? '暂时无法读取数据' : '正在读取工作区'}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{error?.message ?? '站点、规则和采集记录正在加载。'}</p>
    {retry && <Button variant="outline" className="mt-4" onClick={retry}>重新加载</Button>}
  </div>
}

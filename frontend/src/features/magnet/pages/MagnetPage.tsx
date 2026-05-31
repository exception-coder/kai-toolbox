import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { magnetApi } from '../services/magnetApi'
import { NewMagnetForm } from '../components/NewMagnetForm'
import { MagnetTaskList } from '../components/MagnetTaskList'

export function MagnetPage() {
  const { data: health } = useQuery({
    queryKey: ['magnet', 'health'],
    queryFn: () => magnetApi.health(),
    refetchInterval: 10_000,
  })
  const available = health?.available ?? true

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">磁力 / BT 下载</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          本地 aria2c 进程下载,走家庭带宽,文件直接落在你硬盘上。
          磁力提交前并发查多个公共 .torrent 缓存站,命中就跳过 DHT metadata 解析。
        </p>
      </header>

      {!available && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <div className="font-medium text-amber-700 dark:text-amber-300">aria2 daemon 不可用</div>
              <div className="text-amber-700/80 dark:text-amber-300/80">
                {health?.reason ?? '未检测到 aria2c 可执行文件'}
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                下载 aria2 (~5MB) 后将其加入 PATH，或在 application.yml 配置绝对路径：
                <code className="ml-1 font-mono">TOOLBOX_ARIA2_BINARY=D:\devapps\aria2\aria2c.exe</code>
              </div>
            </div>
          </div>
        </div>
      )}

      <NewMagnetForm />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">任务</h2>
        <MagnetTaskList />
      </section>
    </div>
  )
}

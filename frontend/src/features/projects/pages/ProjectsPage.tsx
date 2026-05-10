import { useMemo, useState } from 'react'
import { FolderGit2, RefreshCw, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useProjects } from '../hooks/useProjects'
import { ProjectCard } from '../components/ProjectCard'

export function ProjectsPage() {
  const { data, isLoading, isFetching, error, refetch } = useProjects()
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    if (!data) return []
    const kw = keyword.trim().toLowerCase()
    if (!kw) return data.items
    return data.items.filter(p =>
      p.name.toLowerCase().includes(kw) || p.path.toLowerCase().includes(kw)
    )
  }, [data, keyword])

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderGit2 className="size-4" />
            项目管理
            {data && (
              <span className="ml-2 text-xs font-normal text-[var(--color-muted-foreground)]">
                共 {data.items.length} 个
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={isFetching ? 'animate-spin' : ''} />
                刷新
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="按项目名 / 路径过滤"
              className="pl-8 font-mono text-sm"
            />
          </div>
          {data && (
            <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
              扫描根：{data.root}
            </span>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          加载失败：{error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {data && !data.rootExists && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          扫描根目录不存在：<code className="font-mono">{data.root}</code>
          。请检查 <code className="font-mono">application.yml</code> 中的{' '}
          <code className="font-mono">toolbox.projects.root</code>。
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          加载中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          {keyword ? '没有匹配的项目' : '该目录下暂无项目'}
        </div>
      ) : (
        <div
          className="grid flex-1 auto-rows-min gap-3 overflow-auto pb-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {filtered.map(p => (
            <ProjectCard key={p.path} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, FolderTree, GitBranch, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  deleteLocalSource,
  deleteSource,
  listLocalSources,
  listSources,
  refreshSource,
} from '../api'
import { AddLocalSourceDialog } from '../components/AddLocalSourceDialog'
import { AddSourceDialog } from '../components/AddSourceDialog'

export function DocViewerHome() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const sourcesQ = useQuery({
    queryKey: ['doc-viewer-sources'],
    queryFn: listSources,
  })

  const localSourcesQ = useQuery({
    queryKey: ['doc-viewer-local-sources'],
    queryFn: listLocalSources,
  })

  const refreshM = useMutation({
    mutationFn: (id: string) => refreshSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-viewer-sources'] }),
  })

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-viewer-sources'] }),
  })

  const deleteLocalM = useMutation({
    mutationFn: (id: string) => deleteLocalSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-viewer-local-sources'] }),
  })

  const sources = sourcesQ.data ?? []
  const localSources = localSourcesQ.data ?? []

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-3 py-4 sm:gap-8 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Markdown 文档浏览器</h1>
          <p className="text-xs text-[var(--color-muted-foreground)] sm:text-sm">
            浏览 GitHub 仓库的 markdown，或挂载本机目录并直接在浏览器里编辑
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddLocalSourceDialog
            onAdded={id => navigate(`/tools/doc-viewer/local/${encodeURIComponent(id)}`)}
          />
          <AddSourceDialog
            onAdded={id => navigate(`/tools/doc-viewer/${encodeURIComponent(id)}`)}
          />
        </div>
      </header>

      {/* === 本地目录源 === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">本地目录</h2>
          <Badge variant="outline" className="text-[10px]">可编辑</Badge>
        </div>

        {localSourcesQ.error && (
          <div className="rounded border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
            加载本地目录失败：
            {localSourcesQ.error instanceof ApiError
              ? localSourcesQ.error.message
              : String(localSourcesQ.error)}
          </div>
        )}

        {localSourcesQ.isLoading ? (
          <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
        ) : localSources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <FolderTree className="h-8 w-8 text-[var(--color-muted-foreground)]" />
              <div className="text-sm text-[var(--color-muted-foreground)]">
                还没有本地目录；点击右上角"添加本地目录"挂载一个
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {localSources.map(s => (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderTree className="h-4 w-4 text-[var(--color-primary)]" />
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() =>
                        navigate(`/tools/doc-viewer/local/${encodeURIComponent(s.id)}`)
                      }
                    >
                      {s.alias}
                    </button>
                  </CardTitle>
                  <CardDescription className="truncate text-xs" title={s.rootPath}>
                    {s.rootPath}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-2 text-xs text-[var(--color-muted-foreground)]">
                  <div>上次打开：{formatDate(s.lastVisitedAt)}</div>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const ok = await confirm({
                          title: '移除本地目录',
                          description: `仅从工具中移除挂载，磁盘上的 ${s.rootPath} 不会被删除。`,
                        })
                        if (ok) deleteLocalM.mutate(s.id)
                      }}
                      className="gap-1 text-[var(--color-destructive)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      移除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* === GitHub 文档源 === */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">GitHub 仓库</h2>
          <Badge variant="outline" className="text-[10px]">只读</Badge>
        </div>

        {sourcesQ.error && (
          <div className="rounded border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
            加载文档源失败：
            {sourcesQ.error instanceof ApiError ? sourcesQ.error.message : String(sourcesQ.error)}
          </div>
        )}

        {sourcesQ.isLoading ? (
          <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <BookOpen className="h-8 w-8 text-[var(--color-muted-foreground)]" />
              <div className="text-sm text-[var(--color-muted-foreground)]">
                还没有 GitHub 文档源；点击右上角"添加文档源"开始
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sources.map(s => (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-[var(--color-primary)]" />
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => navigate(`/tools/doc-viewer/${encodeURIComponent(s.id)}`)}
                    >
                      {s.alias}
                    </button>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 text-xs">
                    <span className="truncate">
                      {s.owner}/{s.repo}
                      {s.subPath ? ` / ${s.subPath}` : ''}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-2 text-xs text-[var(--color-muted-foreground)]">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="gap-1">
                      <GitBranch className="h-3 w-3" />
                      {s.ref}
                    </Badge>
                    {s.hasPat && <Badge variant="secondary">PAT</Badge>}
                    {s.rateLimitUntil && s.rateLimitUntil > Date.now() && (
                      <Badge variant="destructive">限流冷却中</Badge>
                    )}
                  </div>
                  <div>上次刷新：{formatDate(s.lastRefreshedAt)}</div>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshM.mutate(s.id)}
                      disabled={refreshM.isPending}
                      className="gap-1"
                    >
                      <RefreshCw
                        className={'h-3.5 w-3.5 ' + (refreshM.isPending ? 'animate-spin' : '')}
                      />
                      刷新
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const ok = await confirm({
                          title: '删除文档源',
                          description: `确定删除 ${s.alias} 吗？仅清理本地缓存，远端仓库不会变更。`,
                        })
                        if (ok) deleteM.mutate(s.id)
                      }}
                      className="gap-1 text-[var(--color-destructive)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

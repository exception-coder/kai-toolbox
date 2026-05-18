import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { createLocalSource } from '../api'

interface AddLocalSourceDialogProps {
  onAdded?: (sourceId: string) => void
}

export function AddLocalSourceDialog({ onAdded }: AddLocalSourceDialogProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [rootPath, setRootPath] = useState('')
  const [alias, setAlias] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setRootPath('')
    setAlias('')
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: () => createLocalSource({ rootPath: rootPath.trim(), alias: alias || null }),
    onSuccess: src => {
      qc.invalidateQueries({ queryKey: ['doc-viewer-local-sources'] })
      setOpen(false)
      reset()
      onAdded?.(src.id)
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : String(err))
    },
  })

  const canSubmit = rootPath.trim().length > 0 && !mutation.isPending

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <FolderPlus className="h-4 w-4" />
        添加本地目录
      </Button>

      <Sheet
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <SheetContent side="right" className="w-[28rem] max-w-[92vw] overflow-y-auto p-5">
          <SheetTitle className="mb-4 text-base font-semibold">添加本地 Markdown 目录</SheetTitle>
          <form
            className="flex flex-col gap-3 text-sm"
            onSubmit={e => {
              e.preventDefault()
              if (canSubmit) mutation.mutate()
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                目录绝对路径（必须存在于运行此工具的机器上）
              </span>
              <Input
                value={rootPath}
                onChange={e => {
                  setRootPath(e.target.value)
                  setError(null)
                }}
                placeholder="例如 D:\\notes\\design 或 /Users/me/notes"
                autoFocus
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                别名（可选；省略时取末段目录名）
              </span>
              <Input
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder="例如：设计文档"
              />
            </label>

            <div className="rounded border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              工具会扫描该目录下的 .md / .markdown / .mdx / .txt / .rst / .adoc 文件，
              并允许直接编辑保存。其它扩展名按只读列出。
            </div>

            {error && (
              <div className="rounded border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={!canSubmit} className="gap-2">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                添加
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

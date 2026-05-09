import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { createSource } from '../api'
import { isGitHubUrlPlausible } from '../lib/parseGitHubUrl'

interface AddSourceDialogProps {
  onAdded?: (sourceId: string) => void
}

export function AddSourceDialog({ onAdded }: AddSourceDialogProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [pat, setPat] = useState('')
  const [alias, setAlias] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setUrl('')
    setPat('')
    setAlias('')
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: () => createSource({ url, pat: pat || null, alias: alias || null }),
    onSuccess: src => {
      qc.invalidateQueries({ queryKey: ['doc-viewer-sources'] })
      setOpen(false)
      reset()
      onAdded?.(src.id)
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : String(err))
    },
  })

  const urlValid = isGitHubUrlPlausible(url)
  const canSubmit = urlValid && !mutation.isPending

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        添加文档源
      </Button>

      <Sheet
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <SheetContent side="right" className="w-[28rem] max-w-[92vw] overflow-y-auto p-5">
          <SheetTitle className="mb-4 text-base font-semibold">添加 GitHub 文档源</SheetTitle>
          <form
            className="flex flex-col gap-3 text-sm"
            onSubmit={e => {
              e.preventDefault()
              if (canSubmit) mutation.mutate()
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                GitHub URL（支持 /tree/、/blob/ 或仓库根）
              </span>
              <Input
                value={url}
                onChange={e => {
                  setUrl(e.target.value)
                  setError(null)
                }}
                placeholder="https://github.com/owner/repo/tree/main/docs"
                autoFocus
                inputMode="url"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                PAT（私库需要；公开仓库可省略）
              </span>
              <Input
                type="password"
                value={pat}
                onChange={e => setPat(e.target.value)}
                placeholder="ghp_..."
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                别名（可选；省略时取 repo/subPath）
              </span>
              <Input
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder="例如：Linux 内核文档"
              />
            </label>

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

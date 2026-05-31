import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useFeatureConfig } from '@/lib/featureConfig'

/** 视频库在 feature-config 里的 key,与后端 FeatureManifest.id 对齐。 */
export const VIDEO_LIBRARY_FEATURE_ID = 'video-library'

export interface VideoLibraryConfig {
  /** 排除目录关键词:路径包含任一项的视频不在列表显示。 */
  excludedDirs: string[]
}

export const VIDEO_LIBRARY_DEFAULTS: VideoLibraryConfig = { excludedDirs: [] }

/**
 * 订阅视频库配置。页面与弹层共用同一 react-query key,弹层保存后页面自动拿到新值并重查。
 * 单独抽出来是为了让 defaults 引用稳定(useFeatureConfig 依赖 defaults 引用)。
 */
export function useVideoLibraryConfig() {
  return useFeatureConfig<VideoLibraryConfig>(VIDEO_LIBRARY_FEATURE_ID, {
    defaults: VIDEO_LIBRARY_DEFAULTS,
  })
}

interface ExcludedDirsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 排除目录管理弹层:增删关键词,保存后整库列表按新规则重新过滤。 */
export function ExcludedDirsSheet({ open, onOpenChange }: ExcludedDirsSheetProps) {
  const { config, isSaving, setConfig } = useVideoLibraryConfig()
  // 本地草稿:编辑期间不打网络,点保存才落库
  const [draft, setDraft] = useState<string[]>(config.excludedDirs)
  const [input, setInput] = useState('')

  // 每次打开时用最新配置重置草稿,避免上次未保存的残留
  useEffect(() => {
    if (open) {
      setDraft(config.excludedDirs)
      setInput('')
    }
  }, [open, config.excludedDirs])

  const addKeyword = () => {
    const kw = input.trim()
    if (!kw) return
    // 大小写不敏感去重,与后端匹配口径一致
    if (draft.some(d => d.toLowerCase() === kw.toLowerCase())) {
      setInput('')
      return
    }
    setDraft([...draft, kw])
    setInput('')
  }

  const removeKeyword = (kw: string) => setDraft(draft.filter(d => d !== kw))

  const save = async () => {
    await setConfig({ excludedDirs: draft })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 p-5 sm:max-w-md">
        <div>
          <SheetTitle>排除目录</SheetTitle>
          <SheetDescription>
            路径中包含任一关键词的视频将不在列表显示。常见噪音目录如 <code className="font-mono">node_modules</code>、
            <code className="font-mono">test/fixtures</code>。匹配方式为路径子串包含、大小写不敏感。
          </SheetDescription>
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addKeyword()
              }
            }}
            placeholder="输入目录关键词，回车添加"
            aria-label="排除目录关键词"
          />
          <Button variant="outline" onClick={addKeyword} disabled={!input.trim()} className="shrink-0 gap-1">
            <Plus className="h-4 w-4" />
            添加
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {draft.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-[var(--color-muted-foreground)]">
              暂无排除目录，所有视频都会显示
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {draft.map(kw => (
                <Badge key={kw} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1.5 text-sm">
                  <span className="break-all">{kw}</span>
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    aria-label={`移除 ${kw}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button size="lg" onClick={save} disabled={isSaving} className="w-full shadow-md">
          {isSaving ? '保存中…' : '保存并应用'}
        </Button>
      </SheetContent>
    </Sheet>
  )
}

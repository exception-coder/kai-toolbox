// java8gu 数据源（GitHub 仓库 + 子目录）配置弹层
// 配置持久化由父组件 useFeatureConfig hook 处理；本弹层只负责草稿态 + 触发 onSaved

import { useState } from 'react'
import { ExternalLink, RotateCcw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_DATA_SOURCE,
  type DataSourceConfig,
} from '../data'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: DataSourceConfig
  /** 用户保存了新配置；返回的 Promise resolve 后弹层才关闭 */
  onSaved: (cfg: DataSourceConfig) => Promise<void>
}

export function DataSourceDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [draft, setDraft] = useState<DataSourceConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // open 变 true 时把 initial 同步回来（关闭再开看到的是最新值）
  // useState 初值只生效一次，单独用 useEffect 同步
  // 这里改用 key 重置策略：父组件可通过重新挂载控制
  // 但为简单起见保留 effect 同步
  // —— 见下方 useEffect
  // （写法保持函数顶部清爽）

  // 同步 initial -> draft
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useSync(initial, setDraft, open)

  const previewTreeUrl = `https://github.com/${draft.owner}/${draft.repo}/tree/${draft.branch}/${draft.dir}`

  const handleReset = () => setDraft({ ...DEFAULT_DATA_SOURCE })
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSaved(draft)
      onOpenChange(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md p-5 sm:p-6">
        <SheetTitle>java8gu 数据源</SheetTitle>
        <SheetDescription className="mt-1">
          指定一个 GitHub 仓库 + 子目录作为题库来源。子目录支持两种结构（自动识别）：
          <ul className="mt-1.5 ml-3 list-disc space-y-0.5 text-[11px]">
            <li>
              嵌套：
              <code className="ml-1 rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono">
                NN_类目名/NNNN_题目名.md
              </code>
            </li>
            <li>
              平铺：
              <code className="ml-1 rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono">
                NN_主题名.md
              </code>
            </li>
          </ul>
        </SheetDescription>

        <div className="mt-5 space-y-3.5">
          <Field
            label="Owner / 组织"
            value={draft.owner}
            placeholder={DEFAULT_DATA_SOURCE.owner}
            onChange={v => setDraft({ ...draft, owner: v })}
          />
          <Field
            label="Repository / 仓库名"
            value={draft.repo}
            placeholder={DEFAULT_DATA_SOURCE.repo}
            onChange={v => setDraft({ ...draft, repo: v })}
          />
          <Field
            label="Branch / 分支"
            value={draft.branch}
            placeholder={DEFAULT_DATA_SOURCE.branch}
            onChange={v => setDraft({ ...draft, branch: v })}
          />
          <Field
            label="Sub directory / 子目录"
            value={draft.dir}
            placeholder={DEFAULT_DATA_SOURCE.dir}
            onChange={v => setDraft({ ...draft, dir: v })}
            hint="留空则使用仓库根目录"
          />
          <Field
            label="GitHub Token（可选）"
            value={draft.token ?? ''}
            placeholder="ghp_… 留空走匿名 60 次/小时"
            onChange={v => setDraft({ ...draft, token: v })}
            type="password"
            hint="填了把目录扫描限流升到 5000 次/小时。仅存在本地 localStorage，不会上传任何服务器"
          />

          <div className="rounded-md border bg-[var(--color-muted)]/30 px-3 py-2 text-[11.5px] text-[var(--color-muted-foreground)]">
            <div className="mb-1 font-medium text-[var(--color-foreground)]/80">
              预览
            </div>
            <a
              href={previewTreeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 break-all text-[var(--color-primary)] hover:underline"
            >
              {previewTreeUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>

        {saveError && (
          <div className="mt-4 rounded-md border border-rose-300/60 bg-rose-50/60 px-3 py-2 text-[11.5px] text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
            保存失败：{saveError}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={saving}
            className="text-[var(--color-muted-foreground)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置默认
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                saving
                || !draft.owner.trim()
                || !draft.repo.trim()
                || !draft.branch.trim()
              }
            >
              {saving ? '保存中…' : '保存并重新拉取'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  value,
  placeholder,
  hint,
  type,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  hint?: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-[var(--color-foreground)]/80">
        {label}
      </span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {hint && (
        <span className="mt-1 block text-[10.5px] text-[var(--color-muted-foreground)]">
          {hint}
        </span>
      )}
    </label>
  )
}

// 内嵌的小同步 hook —— 当弹层从关闭到打开时，把当前最新 initial 写回 draft
import { useEffect } from 'react'
function useSync(
  initial: DataSourceConfig,
  setDraft: (cfg: DataSourceConfig) => void,
  open: boolean,
) {
  useEffect(() => {
    if (open) setDraft({ ...initial })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

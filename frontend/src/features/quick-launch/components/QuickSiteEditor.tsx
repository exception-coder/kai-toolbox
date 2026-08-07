import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { resolveSiteIcon, SITE_ICON_OPTIONS } from '../lib/siteIcons'
import type { OpenMode, QuickSiteUpsert, QuickSiteView } from '../types'

interface Props {
  open: boolean
  site: QuickSiteView | null
  groupNames: string[]
  saving: boolean
  onClose: () => void
  onSave: (payload: QuickSiteUpsert) => void
}

const EMPTY_FORM: QuickSiteUpsert = {
  title: '',
  siteUrl: '',
  groupName: '',
  icon: 'Globe2',
  openMode: 'POPUP',
  windowWidth: 1400,
  windowHeight: 900,
  sortOrder: 0,
  pinned: false,
  enabled: true,
}

export function QuickSiteEditor({ open, site, groupNames, saving, onClose, onSave }: Props) {
  const [form, setForm] = useState<QuickSiteUpsert>(EMPTY_FORM)

  useEffect(() => {
    if (!open) return
    setForm(site ? toForm(site) : EMPTY_FORM)
  }, [open, site])

  const Icon = resolveSiteIcon(form.icon ?? 'Globe2')
  const update = <K extends keyof QuickSiteUpsert>(key: K, value: QuickSiteUpsert[K]) =>
    setForm(current => ({ ...current, [key]: value }))

  return (
    <Sheet open={open} onOpenChange={next => !next && onClose()}>
      <SheetContent className="w-[min(92vw,440px)] max-w-none overflow-y-auto p-5">
        <SheetTitle>{site ? '编辑站点' : '新增站点'}</SheetTitle>
        <SheetDescription className="mt-1">配置常用工作页面及打开窗口方式。</SheetDescription>

        <form
          className="mt-5 space-y-4"
          onSubmit={event => {
            event.preventDefault()
            onSave(form)
          }}
        >
          <Field label="标题" required>
            <Input value={form.title} maxLength={100} onChange={event => update('title', event.target.value)} />
          </Field>
          <Field label="网址" required hint="支持 http、https 和 localhost">
            <Input
              value={form.siteUrl}
              maxLength={2000}
              placeholder="http://localhost:5173"
              onChange={event => update('siteUrl', event.target.value)}
            />
          </Field>
          <Field label="分组">
            <Combobox
              value={form.groupName ?? ''}
              options={groupNames.map(groupName => ({ label: groupName, value: groupName }))}
              placeholder="例如：本地调试"
              emptyText="没有匹配分组，保存后将自动创建"
              showAllOnOpen
              onChange={value => update('groupName', value.slice(0, 64))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="图标">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border"><Icon className="size-4" /></span>
                <select
                  value={form.icon}
                  onChange={event => update('icon', event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 text-sm"
                >
                  {SITE_ICON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </Field>
            <Field label="打开方式">
              <select
                value={form.openMode}
                onChange={event => update('openMode', event.target.value as OpenMode)}
                className="h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm"
              >
                <option value="POPUP">独立窗口</option>
                <option value="TAB">新标签页</option>
                <option value="CURRENT">当前页面</option>
              </select>
            </Field>
          </div>

          {form.openMode === 'POPUP' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="窗口宽度">
                <Input type="number" min={480} max={3840} value={form.windowWidth} onChange={event => update('windowWidth', Number(event.target.value))} />
              </Field>
              <Field label="窗口高度">
                <Input type="number" min={360} max={2160} value={form.windowHeight} onChange={event => update('windowHeight', Number(event.target.value))} />
              </Field>
            </div>
          )}

          <Field label="排序号" hint="数字越小越靠前">
            <Input type="number" min={-10000} max={10000} value={form.sortOrder} onChange={event => update('sortOrder', Number(event.target.value))} />
          </Field>

          <div className="flex flex-wrap gap-5 rounded-md border p-3 text-sm">
            <CheckField label="置顶" checked={!!form.pinned} onChange={value => update('pinned', value)} />
            <CheckField label="启用" checked={form.enabled !== false} onChange={value => update('enabled', value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving || !form.title.trim() || !form.siteUrl.trim()}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}{required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}</span>
      {children}
      {hint && <span className="block text-xs text-[var(--color-muted-foreground)]">{hint}</span>}
    </label>
  )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function toForm(site: QuickSiteView): QuickSiteUpsert {
  return {
    title: site.title,
    siteUrl: site.siteUrl,
    groupName: site.groupName,
    icon: site.icon,
    openMode: site.openMode,
    windowWidth: site.windowWidth,
    windowHeight: site.windowHeight,
    sortOrder: site.sortOrder,
    pinned: site.pinned,
    enabled: site.enabled,
  }
}

import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND_DEFAULTS, useBrand } from './brand'

/** ThemeMenu 内的应用品牌编辑区：改应用名 / 副标题，保存上库（不重启生效），可重置回默认。 */
export function BrandEditor() {
  const { brand, setBrand, resetBrand, isSaving } = useBrand()
  const [appName, setAppName] = useState(brand.appName)
  const [tagline, setTagline] = useState(brand.tagline)

  // 远端配置拉到 / 变更后同步进草稿
  useEffect(() => {
    setAppName(brand.appName)
    setTagline(brand.tagline)
  }, [brand.appName, brand.tagline])

  const trimmedName = appName.trim()
  const dirty = trimmedName !== brand.appName || tagline.trim() !== brand.tagline
  const canSave = dirty && trimmedName.length > 0 && !isSaving

  const save = async () => {
    if (!canSave) return
    await setBrand({ appName: trimmedName, tagline: tagline.trim() })
  }

  const isDefault =
    brand.appName === BRAND_DEFAULTS.appName && brand.tagline === BRAND_DEFAULTS.tagline

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-[var(--color-muted-foreground)]">应用品牌</div>

      <label className="block">
        <span className="mb-0.5 block text-[11px] text-[var(--color-muted-foreground)]">名称</span>
        <input
          value={appName}
          onChange={e => setAppName(e.target.value)}
          placeholder={BRAND_DEFAULTS.appName}
          maxLength={40}
          className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-0.5 block text-[11px] text-[var(--color-muted-foreground)]">副标题</span>
        <input
          value={tagline}
          onChange={e => setTagline(e.target.value)}
          placeholder={BRAND_DEFAULTS.tagline}
          maxLength={60}
          className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
        />
      </label>

      <div className="flex items-center gap-2 pt-0.5">
        <Button size="sm" className="h-7 flex-1 gap-1" onClick={save} disabled={!canSave}>
          <Save className="size-3.5" /> 保存
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1"
          onClick={() => resetBrand()}
          disabled={isSaving || isDefault}
          title="恢复默认品牌"
        >
          <RotateCcw className="size-3.5" /> 默认
        </Button>
      </div>
    </div>
  )
}

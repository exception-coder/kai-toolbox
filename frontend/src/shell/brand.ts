// 应用品牌（显示名 + 副标题）可配置存储
//
// 走通用 feature-config KV（/api/feature-configs/shell-brand）：
// - 后端宕机时回落 defaults，菜单/首页照常渲染（符合 CLAUDE.md「菜单与后端解耦」约定）
// - 全站只一份 react-query 缓存，Sidebar / HomePage / AppShell 多处订阅共享
import { useFeatureConfig } from '@/lib/featureConfig'

export interface BrandConfig {
  /** 左上角与首页主标题、浏览器标签名 */
  appName: string
  /** 首页主标题下方副标题 */
  tagline: string
}

// 模块级常量：引用稳定，满足 useFeatureConfig 对 defaults 的要求
export const BRAND_DEFAULTS: BrandConfig = {
  appName: 'Forge',
  tagline: 'The Workspace for Vibe Coding',
}

export const BRAND_FEATURE_ID = 'shell-brand'

/** 订阅品牌配置；config 永不为空（未拉到走 defaults）。 */
export function useBrand() {
  const { config, setConfig, resetConfig, isSaving, isReady } = useFeatureConfig<BrandConfig>(
    BRAND_FEATURE_ID,
    { defaults: BRAND_DEFAULTS },
  )
  return { brand: config, setBrand: setConfig, resetBrand: resetConfig, isSaving, isReady }
}

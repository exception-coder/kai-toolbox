import type { FeatureManifest } from './types'

const modules = import.meta.glob<{ default: FeatureManifest }>(
  '../features/*/index.tsx',
  { eager: true }
)

export const features: FeatureManifest[] = Object.values(modules)
  .map(m => m.default)
  .filter(Boolean)

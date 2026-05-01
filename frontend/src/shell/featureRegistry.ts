import type { FeatureManifest } from './types'

const modules = import.meta.glob<{ default: FeatureManifest }>(
  '../features/*/index.tsx',
  { eager: true }
)

export const features: FeatureManifest[] = Object.values(modules)
  .map(m => m.default)
  .filter(Boolean)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name))

export function entryOf(f: FeatureManifest): string {
  return f.entry ?? f.routes[0]?.path ?? '/'
}

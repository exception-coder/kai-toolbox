// Keep mock modules out of the normal startup graph. Load them before mounting
// the app only when mock mode is enabled, so registrations precede API calls.
const mockModules = import.meta.glob('../../features/*/mock.ts')
let loadPromise: Promise<void> | null = null

export async function loadFeatureMocks(): Promise<void> {
  loadPromise ??= Promise.all(Object.values(mockModules).map(load => load())).then(() => {}).catch(error => {
    loadPromise = null
    throw error
  })
  await loadPromise
}

// 真正写了 mock 实现的 feature id 集合（从同一份 glob 派生，避免重复 glob）。
// 供 UI 判断「当前模块是否支持 mock」——没实现的不展示 Mock 入口。
export const featuresWithMock: Set<string> = new Set(
  Object.keys(mockModules)
    .map(p => /\/features\/([^/]+)\/mock\.ts$/.exec(p)?.[1])
    .filter((id): id is string => Boolean(id)),
)

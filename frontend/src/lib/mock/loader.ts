// Side-effect import: eagerly evaluate every feature mock module so its
// `registerHttp` / `registerSse` calls run once at app startup. The mock
// registry only takes effect when `isMockEnabled()` is true (gated inside
// `lib/api.ts`), so importing this file in non-mock mode is harmless.
const mockModules = import.meta.glob('../../features/*/mock.ts', { eager: true })

// 真正写了 mock 实现的 feature id 集合（从同一份 eager glob 派生，避免重复 glob）。
// 供 UI 判断「当前模块是否支持 mock」——没实现的不展示 Mock 入口。
export const featuresWithMock: Set<string> = new Set(
  Object.keys(mockModules)
    .map(p => /\/features\/([^/]+)\/mock\.ts$/.exec(p)?.[1])
    .filter((id): id is string => Boolean(id)),
)

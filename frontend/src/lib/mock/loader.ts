// Side-effect import: eagerly evaluate every feature mock module so its
// `registerHttp` / `registerSse` calls run once at app startup. The mock
// registry only takes effect when `isMockEnabled()` is true (gated inside
// `lib/api.ts`), so importing this file in non-mock mode is harmless.
import.meta.glob('../../features/*/mock.ts', { eager: true })

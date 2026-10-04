import { describe, expect, it } from 'vitest'
import { summarizeVibeResources } from './vibeEntryDiagnostics'

describe('summarizeVibeResources', () => {
  it('counts module categories and timings without returning resource names', () => {
    const entries = [
      { name: 'https://forge.test/src/features/claude-chat/pages/ChatPage.tsx', transferSize: 100, responseEnd: 300, duration: 150 },
      { name: 'https://forge.test/src/features/ops/index.tsx', transferSize: 50, responseEnd: 250, duration: 75 },
      { name: 'https://forge.test/src/main.tsx', transferSize: 25, responseEnd: 100, duration: 20 },
      { name: 'https://forge.test/icons/icon.svg', transferSize: 200, responseEnd: 90, duration: 15 },
    ] as PerformanceResourceTiming[]

    expect(summarizeVibeResources(entries)).toEqual({
      chatModules: 1, otherFeatureModules: 1, commonModules: 1,
      transferBytes: 175, lastModuleMs: 300, slowestModuleMs: 150,
    })
  })
})

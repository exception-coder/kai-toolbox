import { expect, it, vi } from 'vitest'
import { createAssistantLoader, type AssistantRuntime } from './loader'

const manifest = {
  schemaVersion: 1,
  channel: 'stable',
  version: 'sha256-2c26b46b68ff',
  releasedAt: '2026-08-26T03:40:00.000Z',
  artifacts: {
    iife: {
      path: 'releases/sha256-2c26b46b68ff/kai-assistant.iife.js',
      integrity: `sha384-${'A'.repeat(64)}`,
    },
    esm: {
      path: 'releases/sha256-2c26b46b68ff/kai-assistant.es.js',
      integrity: `sha384-${'B'.repeat(64)}`,
    },
  },
}

function runtime(): AssistantRuntime {
  return {
    initializeAssistant: vi.fn(),
    initialize: vi.fn(),
  } as unknown as AssistantRuntime
}

it('loads and validates the selected release once', async () => {
  let activeRuntime: AssistantRuntime | undefined
  let activeVersion: string | undefined
  const fetchManifest = vi.fn(async () => manifest)
  const loadScript = vi.fn(async () => { activeRuntime = runtime() })
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://forge.example/assistant-sdk/',
    fetchManifest,
    loadScript,
    runtime: () => activeRuntime,
    currentVersion: () => activeVersion,
    rememberVersion: version => { activeVersion = version },
  })

  const first = loader.load()
  const second = loader.load()
  expect(first).toBe(second)
  await expect(first).resolves.toMatchObject({ version: manifest.version, channel: 'stable' })
  expect(fetchManifest).toHaveBeenCalledOnce()
  expect(loadScript).toHaveBeenCalledWith(
    'https://forge.example/assistant-sdk/releases/sha256-2c26b46b68ff/kai-assistant.iife.js',
    manifest.artifacts.iife.integrity,
    manifest.version,
  )
})

it('rejects an artifact that escapes the SDK release directory', async () => {
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://forge.example/assistant-sdk/',
    fetchManifest: async () => ({
      ...manifest,
      artifacts: { ...manifest.artifacts, iife: { ...manifest.artifacts.iife, path: '../evil.js' } },
    }),
    loadScript: vi.fn(),
    runtime: () => undefined,
    currentVersion: () => undefined,
    rememberVersion: vi.fn(),
  })

  await expect(loader.load()).rejects.toThrow('invalid iife artifact')
})

it('clears a failed load so a later call can retry', async () => {
  let attempt = 0
  let activeRuntime: AssistantRuntime | undefined
  const fetchManifest = vi.fn(async () => manifest)
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://forge.example/assistant-sdk/',
    fetchManifest,
    loadScript: async () => {
      attempt += 1
      if (attempt === 1) throw new Error('network down')
      activeRuntime = runtime()
    },
    runtime: () => activeRuntime,
    currentVersion: () => undefined,
    rememberVersion: vi.fn(),
  })

  await expect(loader.load()).rejects.toThrow('network down')
  await expect(loader.load()).resolves.toMatchObject({ version: manifest.version })
  expect(fetchManifest).toHaveBeenCalledTimes(2)
})

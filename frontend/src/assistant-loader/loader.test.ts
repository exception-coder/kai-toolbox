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

it('injects the loader origin as the default request base URL', async () => {
  const initialize = vi.fn()
  const activeRuntime = {
    initializeAssistant: initialize,
    initialize,
  } as unknown as AssistantRuntime
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://forge.example/assistant-sdk/',
    fetchManifest: vi.fn(async () => manifest),
    loadScript: vi.fn(),
    runtime: () => activeRuntime,
    currentVersion: () => manifest.version,
    rememberVersion: vi.fn(),
  })

  const { sdk } = await loader.load()
  sdk.initialize({ appId: 'ERP' })
  expect(initialize).toHaveBeenCalledWith({ appId: 'ERP', requestBaseUrl: 'https://forge.example' })
})

it('replaces an existing runtime when the stable manifest points to a newer release', async () => {
  const oldRuntime = runtime()
  const newRuntime = runtime()
  let activeRuntime = oldRuntime
  const loadScript = vi.fn(async () => { activeRuntime = newRuntime })
  const rememberVersion = vi.fn()
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://forge.example/assistant-sdk/',
    fetchManifest: vi.fn(async () => manifest),
    loadScript,
    runtime: () => activeRuntime,
    currentVersion: () => 'sha256-000000000000',
    rememberVersion,
  })

  const loaded = await loader.load()

  expect(loadScript).toHaveBeenCalledWith(
    `https://forge.example/assistant-sdk/${manifest.artifacts.iife.path}`,
    manifest.artifacts.iife.integrity,
    manifest.version,
  )
  expect(loaded.sdk.initializeAssistant).not.toBe(oldRuntime.initializeAssistant)
  expect(rememberVersion).toHaveBeenCalledWith(manifest.version)
})

it('allows loader and initialize request origins with initialize taking precedence', async () => {
  const initialize = vi.fn()
  const activeRuntime = {
    initializeAssistant: initialize,
    initialize,
  } as unknown as AssistantRuntime
  const loader = createAssistantLoader({
    defaultBaseUrl: 'https://cdn.example/assistant-sdk/',
    fetchManifest: vi.fn(async () => manifest),
    loadScript: vi.fn(),
    runtime: () => activeRuntime,
    currentVersion: () => manifest.version,
    rememberVersion: vi.fn(),
  })

  const { sdk } = await loader.load({ requestBaseUrl: 'http://10.10.8.20:8080' })
  sdk.initialize({ appId: 'ERP', requestBaseUrl: 'http://10.10.8.21:8080' })
  expect(initialize).toHaveBeenCalledWith({ appId: 'ERP', requestBaseUrl: 'http://10.10.8.21:8080' })
})
